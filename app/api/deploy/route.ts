import { NextResponse } from 'next/server'
import { Sandbox } from '@vercel/sandbox'
import { logRepair } from '@/lib/telemetry'

export const maxDuration = 180

const CF_API_TOKEN = process.env.CF_API_TOKEN
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID

function projectName(sandboxId: string) {
  return 'cm-' + sandboxId.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20)
}

async function readSandboxFile(sandbox: Sandbox, path: string): Promise<Buffer> {
  const stream = await sandbox.readFile({ path })
  if (!stream) throw new Error(`File not found: ${path}`)
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    if (Buffer.isBuffer(chunk)) chunks.push(chunk)
    else if (typeof chunk === 'string') chunks.push(Buffer.from(chunk, 'utf8'))
    else chunks.push(Buffer.from(chunk as ArrayBuffer))
  }
  return Buffer.concat(chunks)
}

// wrangler CANNOT create a missing Pages project in a non-interactive shell —
// it prompts, gets no answer, and exits non-zero. Create the project via the
// CF API first (idempotent: skip if it already exists). This was the root cause
// of "deploy shows a link but the link doesn't work": wrangler failed silently
// and the route returned a guessed URL for a project that never existed.
async function ensurePagesProject(name: string): Promise<string | null> {
  const base = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects`
  const headers = {
    Authorization: `Bearer ${CF_API_TOKEN}`,
    'Content-Type': 'application/json',
  }
  try {
    const get = await fetch(`${base}/${name}`, { headers, signal: AbortSignal.timeout(10_000) })
    if (get.ok) return null // already exists
    const create = await fetch(base, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, production_branch: 'main' }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!create.ok) {
      const body = await create.text().catch(() => '')
      // 409/already exists is fine (race with a previous deploy)
      if (create.status === 409 || /already exists/i.test(body)) return null
      return `Could not set up the deployment project (${create.status}): ${body.slice(0, 300)}`
    }
    return null
  } catch (e) {
    return `Deployment project setup failed: ${e instanceof Error ? e.message : 'unknown'}`
  }
}

export async function POST(req: Request) {
  const { sandboxId } = await req.json() as { sandboxId: string }
  if (!sandboxId) return NextResponse.json({ error: 'sandboxId required' }, { status: 400 })
  if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
    return NextResponse.json({ error: 'Deployment not configured' }, { status: 500 })
  }

  let sandbox: Sandbox
  try {
    sandbox = await Sandbox.get({ sandboxId })
  } catch {
    return NextResponse.json({ error: 'Workspace not found or has expired' }, { status: 404 })
  }

  const name = projectName(sandboxId)

  // Step 1: Build
  try {
    const buildCmd = await sandbox.runCommand({
      detached: true,
      cmd: 'bash',
      args: [
        '-c',
        '(command -v bun >/dev/null 2>&1 && bun run build || pnpm build) > /tmp/deploy-build.log 2>&1; echo "##EXIT:$?" >> /tmp/deploy-build.log',
      ],
    })
    await Promise.race([
      buildCmd.wait(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Build timed out after 120s')), 120_000)),
    ])

    try {
      const logBuf = await readSandboxFile(sandbox, '/tmp/deploy-build.log')
      const log = logBuf.toString('utf8')
      const exitMatch = log.match(/##EXIT:(\d+)/)
      const exitCode = exitMatch ? parseInt(exitMatch[1], 10) : null
      if (exitCode !== 0) {
        const errorLines = log.replace(/##EXIT:\d+/, '').trim().split('\n').slice(-30).join('\n')
        logRepair({ layer: 'deploy', action: 'build-failed', detail: errorLines.slice(-300), sandboxId })
        return NextResponse.json({ error: `Build failed:\n${errorLines}` }, { status: 500 })
      }
    } catch {
      // Can't read log — proceed
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    return NextResponse.json({ error: `Build error: ${msg}` }, { status: 500 })
  }

  // Step 1.5: Make sure the Pages project exists BEFORE wrangler runs.
  const projectError = await ensurePagesProject(name)
  if (projectError) {
    logRepair({ layer: 'deploy', action: 'project-create-failed', detail: projectError, sandboxId })
    return NextResponse.json({ error: projectError }, { status: 500 })
  }

  // Step 2: Deploy via wrangler (official CF Pages deploy tool)
  // Write credentials to a temp script, execute, then delete immediately.
  // --branch main marks this as a PRODUCTION deployment so the canonical
  // https://<name>.pages.dev URL serves it (a non-production deploy only gets a
  // hash-prefixed preview URL — returning the canonical URL for it = dead link).
  const deployScript = [
    '#!/bin/bash',
    `export CLOUDFLARE_API_TOKEN="${CF_API_TOKEN}"`,
    `export CLOUDFLARE_ACCOUNT_ID="${CF_ACCOUNT_ID}"`,
    `npx --yes wrangler@3 pages deploy dist --project-name "${name}" --branch main --commit-dirty true 2>&1 | tee /tmp/cm-deploy.log`,
    'echo "##WRANGLER_EXIT:${PIPESTATUS[0]}" >> /tmp/cm-deploy.log',
  ].join('\n')

  try {
    await sandbox.writeFiles([{ path: '/tmp/cm-wrangler-deploy.sh', content: Buffer.from(deployScript, 'utf8') }])

    const deployCmd = await sandbox.runCommand({
      detached: true,
      cmd: 'bash',
      args: ['/tmp/cm-wrangler-deploy.sh'],
    })

    await Promise.race([
      deployCmd.wait(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Deploy timed out after 150s')), 150_000)),
    ])

    // Clean up script immediately (contains token)
    sandbox.runCommand({ detached: true, cmd: 'rm', args: ['-f', '/tmp/cm-wrangler-deploy.sh'] }).catch(() => {})

    // Read wrangler output from the log file (more reliable than stdout streams)
    let deployOutput = ''
    try {
      deployOutput = (await readSandboxFile(sandbox, '/tmp/cm-deploy.log')).toString('utf8')
    } catch {
      /* fall through — treated as unverifiable below */
    }

    // HARD VERIFICATION — never return a URL unless wrangler actually succeeded.
    // (Previously a wrangler failure fell through to a guessed URL = dead link.)
    const exitMatch = deployOutput.match(/##WRANGLER_EXIT:(\d+)/)
    const wranglerExit = exitMatch ? parseInt(exitMatch[1], 10) : null
    if (wranglerExit !== 0) {
      const errorLines =
        deployOutput
          .split('\n')
          .filter(l => /error|fail|fatal|denied|unauthorized/i.test(l))
          .slice(-6)
          .join('\n') || deployOutput.trim().slice(-500)
      logRepair({ layer: 'deploy', action: 'wrangler-failed', detail: errorLines.slice(0, 300), sandboxId })
      return NextResponse.json({ error: `Publish failed:\n${errorLines}` }, { status: 500 })
    }

    // Success confirmed — the canonical project URL serves production deploys.
    const deployedUrl = `https://${name}.pages.dev`

    // First deploys need DNS/edge propagation for the new pages.dev subdomain —
    // returning the link before it resolves looks like a dead link to the user.
    // Poll until it serves (up to ~40s); non-fatal if it's still propagating.
    for (let i = 0; i < 8; i++) {
      try {
        const ping = await fetch(deployedUrl, { signal: AbortSignal.timeout(4000) })
        if (ping.ok) break
      } catch { /* not resolving yet */ }
      await new Promise(r => setTimeout(r, 5000))
    }
    logRepair({ layer: 'deploy', action: 'published', detail: deployedUrl, sandboxId })

    return NextResponse.json({ url: deployedUrl, projectName: name })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    sandbox.runCommand({ detached: true, cmd: 'rm', args: ['-f', '/tmp/cm-wrangler-deploy.sh'] }).catch(() => {})
    logRepair({ layer: 'deploy', action: 'deploy-error', detail: msg, sandboxId })
    return NextResponse.json({ error: `Deployment failed: ${msg}` }, { status: 500 })
  }
}
