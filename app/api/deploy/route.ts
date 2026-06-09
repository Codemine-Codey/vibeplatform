import { NextResponse } from 'next/server'
import { Sandbox } from '@vercel/sandbox'
import crypto from 'node:crypto'

export const maxDuration = 120

const CF_API_TOKEN = process.env.CF_API_TOKEN
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID

function cfHeaders(contentType = true) {
  const h: Record<string, string> = { Authorization: `Bearer ${CF_API_TOKEN}` }
  if (contentType) h['Content-Type'] = 'application/json'
  return h
}

function projectName(sandboxId: string) {
  return 'cm-' + sandboxId.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20)
}

async function ensureProject(name: string) {
  const get = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${name}`,
    { headers: cfHeaders(false) }
  )
  if (get.ok) return

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects`,
    {
      method: 'POST',
      headers: cfHeaders(),
      body: JSON.stringify({ name, production_branch: 'main' }),
    }
  )
  if (!res.ok) {
    const body = await res.text()
    console.error('[deploy] ensureProject failed:', body)
    throw new Error('Failed to create project')
  }
}

async function readSandboxFile(sandbox: Sandbox, path: string): Promise<Buffer> {
  const stream = await sandbox.readFile({ path })
  if (!stream) throw new Error(`File not found: ${path}`)
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk)
    } else if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk, 'utf8'))
    } else {
      chunks.push(Buffer.from(chunk as ArrayBuffer))
    }
  }
  return Buffer.concat(chunks)
}

export async function POST(req: Request) {
  const { sandboxId } = await req.json() as { sandboxId: string }
  if (!sandboxId) return NextResponse.json({ error: 'sandboxId required' }, { status: 400 })
  if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
    console.error('[deploy] Missing CF_API_TOKEN or CF_ACCOUNT_ID')
    return NextResponse.json({ error: 'Deployment not configured' }, { status: 500 })
  }

  let sandbox: Sandbox
  try {
    sandbox = await Sandbox.get({ sandboxId })
  } catch {
    return NextResponse.json({ error: 'Workspace not found or has expired' }, { status: 404 })
  }

  // Step 1: Build — capture output to file so we can return the actual error
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

    // Read log to check exit code
    try {
      const logBuf = await readSandboxFile(sandbox, '/tmp/deploy-build.log')
      const log = logBuf.toString('utf8')
      const exitMatch = log.match(/##EXIT:(\d+)/)
      const exitCode = exitMatch ? parseInt(exitMatch[1], 10) : null
      if (exitCode !== 0) {
        const errorLines = log.replace(/##EXIT:\d+/, '').trim().split('\n').slice(-30).join('\n')
        console.error('[deploy] build failed:\n', errorLines)
        return NextResponse.json({ error: `Build failed:\n${errorLines}` }, { status: 500 })
      }
    } catch {
      // Can't read log — proceed and hope build succeeded
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    console.error('[deploy] build error:', msg)
    return NextResponse.json({ error: `Build error: ${msg}` }, { status: 500 })
  }

  // Step 2: Add _redirects for SPA routing + list dist/ files
  try {
    await sandbox.writeFiles([
      // SPA fallback — CF Pages returns index.html for all non-asset routes
      { path: 'dist/_redirects', content: Buffer.from('/*  /index.html  200\n', 'utf8') },
      {
        path: '.cm-list.cjs',
        content: Buffer.from(
          `const fs=require('fs'),path=require('path');function w(d){const r=[];for(const f of fs.readdirSync(d)){const p=path.join(d,f);fs.statSync(p).isDirectory()?r.push(...w(p)):r.push(p)}return r}fs.writeFileSync('.cm-files.json',JSON.stringify(w('dist')))`,
          'utf8'
        ),
      },
    ])
    const listCmd = await sandbox.runCommand({ detached: true, cmd: 'node', args: ['.cm-list.cjs'] })
    await listCmd.wait()
  } catch {
    return NextResponse.json({ error: 'Failed to read build output' }, { status: 500 })
  }

  // Step 3: Parse file list
  let distFiles: string[]
  try {
    const listContent = await readSandboxFile(sandbox, '.cm-files.json')
    distFiles = JSON.parse(listContent.toString('utf8'))
  } catch {
    return NextResponse.json({ error: 'Failed to read build file list' }, { status: 500 })
  }

  if (distFiles.length === 0) {
    return NextResponse.json({ error: 'No build output found — run pnpm build first' }, { status: 500 })
  }

  // Step 4: Read all dist/ files and compute hashes
  const files: Array<{ path: string; content: Buffer; hash: string }> = []
  for (const filePath of distFiles) {
    try {
      const content = await readSandboxFile(sandbox, filePath)
      const hash = crypto.createHash('sha256').update(content).digest('hex')
      const relativePath = filePath.replace(/^dist\//, '')
      files.push({ path: relativePath, content, hash })
    } catch {
      // skip unreadable files
    }
  }

  // Step 5: Ensure Pages project exists
  const name = projectName(sandboxId)
  try {
    await ensureProject(name)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create project' }, { status: 500 })
  }

  // Step 6: Direct Upload via CF Pages API
  try {
    const manifest: Record<string, string> = {}
    for (const f of files) manifest['/' + f.path] = f.hash

    const formData = new FormData()
    formData.append('manifest', JSON.stringify(manifest))
    for (const f of files) {
      formData.append(f.hash, new Blob([new Uint8Array(f.content)]), f.path)
    }

    const deployRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${name}/deployments`,
      { method: 'POST', headers: cfHeaders(false), body: formData }
    )
    const raw = await deployRes.text()
    let deployData: { success: boolean; result?: { url?: string; subdomain?: string }; errors?: { message: string }[] }
    try { deployData = JSON.parse(raw) } catch { deployData = { success: false } }

    if (!deployData.success) {
      console.error('[deploy] upload failed:', raw)
      const msg = deployData.errors?.[0]?.message ?? 'Upload failed'
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    // Use the URL CF returns (deployment-specific subdomain), fall back to production domain
    const deployedUrl = deployData.result?.url ?? `https://${name}.pages.dev`
    return NextResponse.json({ url: deployedUrl, projectName: name })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    console.error('[deploy] upload exception:', msg)
    return NextResponse.json({ error: `Deployment failed: ${msg}` }, { status: 500 })
  }
}
