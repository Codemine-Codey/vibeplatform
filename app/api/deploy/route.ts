import { NextResponse } from 'next/server'
import { Sandbox } from '@vercel/sandbox'

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
        return NextResponse.json({ error: `Build failed:\n${errorLines}` }, { status: 500 })
      }
    } catch {
      // Can't read log — proceed
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    return NextResponse.json({ error: `Build error: ${msg}` }, { status: 500 })
  }

  // Step 2: Deploy via wrangler (official CF Pages deploy tool)
  // Write credentials to a temp script, execute, then delete immediately
  const deployScript = [
    '#!/bin/bash',
    `export CLOUDFLARE_API_TOKEN="${CF_API_TOKEN}"`,
    `export CLOUDFLARE_ACCOUNT_ID="${CF_ACCOUNT_ID}"`,
    `npx --yes wrangler@3 pages deploy dist --project-name "${name}" --commit-dirty true 2>&1`,
    'echo "##WRANGLER_EXIT:$?"',
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

    // Read wrangler output
    let deployOutput = ''
    try {
      const done = await deployCmd.wait().catch(() => null)
      if (done) {
        const [stdout] = await Promise.all([done.stdout(), done.stderr()])
        deployOutput = stdout
      }
    } catch {
      // fallback: try reading from a log
    }

    // Parse the deployed URL from wrangler output
    // Wrangler prints: "✨ Deployment complete! Take a peek over at https://xxx.yyy.pages.dev"
    // or: "✨  Success! Deployed to https://xxx.pages.dev"
    const urlMatch = deployOutput.match(/https:\/\/[a-z0-9-]+\.pages\.dev[^\s]*/i)
    const deployedUrl = urlMatch ? urlMatch[0].replace(/[.)]+$/, '') : `https://${name}.pages.dev`

    return NextResponse.json({ url: deployedUrl, projectName: name })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    sandbox.runCommand({ detached: true, cmd: 'rm', args: ['-f', '/tmp/cm-wrangler-deploy.sh'] }).catch(() => {})
    return NextResponse.json({ error: `Deployment failed: ${msg}` }, { status: 500 })
  }
}
