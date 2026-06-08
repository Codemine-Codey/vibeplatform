import { NextResponse } from 'next/server'
import { Sandbox } from '@vercel/sandbox'
import crypto from 'node:crypto'

export const maxDuration = 120

const CF_API_TOKEN = process.env.CF_API_TOKEN!
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID!

function projectName(sandboxId: string) {
  return 'cm-' + sandboxId.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20)
}

async function ensureProject(name: string) {
  // Try to get project first
  const get = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${name}`,
    { headers: { Authorization: `Bearer ${CF_API_TOKEN}` } }
  )
  if (get.ok) return // already exists

  // Create project
  await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, production_branch: 'main' }),
    }
  )
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
  if (!CF_API_TOKEN || !CF_ACCOUNT_ID) return NextResponse.json({ error: 'CF credentials not configured' }, { status: 500 })

  let sandbox: Sandbox
  try {
    sandbox = await Sandbox.get({ sandboxId })
  } catch {
    return NextResponse.json({ error: 'Sandbox not found' }, { status: 404 })
  }

  // Step 1: Build
  try {
    const buildCmd = await sandbox.runCommand({ detached: true, cmd: 'pnpm', args: ['build'] })
    await Promise.race([
      buildCmd.wait(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Build timed out after 90s')), 90_000)),
    ])
  } catch (err) {
    return NextResponse.json({ error: `Build failed: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 500 })
  }

  // Step 2: List dist/ files using a helper script
  try {
    await sandbox.writeFiles([{
      path: '.cm-list.cjs',
      content: Buffer.from(
        `const fs=require('fs'),path=require('path');function w(d){const r=[];for(const f of fs.readdirSync(d)){const p=path.join(d,f);fs.statSync(p).isDirectory()?r.push(...w(p)):r.push(p)}return r}fs.writeFileSync('.cm-files.json',JSON.stringify(w('dist')))`,
        'utf8'
      ),
    }])
    const listCmd = await sandbox.runCommand({ detached: true, cmd: 'node', args: ['.cm-list.cjs'] })
    await listCmd.wait()
  } catch {
    return NextResponse.json({ error: 'Failed to list build output' }, { status: 500 })
  }

  // Step 3: Read file list
  let distFiles: string[]
  try {
    const listContent = await readSandboxFile(sandbox, '.cm-files.json')
    distFiles = JSON.parse(listContent.toString('utf8'))
  } catch {
    return NextResponse.json({ error: 'Failed to read build file list' }, { status: 500 })
  }

  if (distFiles.length === 0) {
    return NextResponse.json({ error: 'No build output found in dist/' }, { status: 500 })
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
      // Skip unreadable files
    }
  }

  // Step 5: Ensure CF Pages project exists
  const name = projectName(sandboxId)
  try {
    await ensureProject(name)
  } catch {
    return NextResponse.json({ error: 'Failed to create CF Pages project' }, { status: 500 })
  }

  // Step 6: Upload deployment via CF Pages Direct Upload API
  try {
    const manifest: Record<string, string> = {}
    for (const f of files) {
      manifest['/' + f.path] = f.hash
    }

    const formData = new FormData()
    formData.append('manifest', JSON.stringify(manifest))
    for (const f of files) {
      formData.append(f.hash, new Blob([new Uint8Array(f.content)]), f.path)
    }

    const deployRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${name}/deployments`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${CF_API_TOKEN}` },
        body: formData,
      }
    )
    const deployData = await deployRes.json() as { success: boolean; result?: { url?: string } }
    if (!deployData.success) {
      return NextResponse.json({ error: 'CF Pages deployment failed' }, { status: 500 })
    }

    const deployedUrl = `https://${name}.pages.dev`
    return NextResponse.json({ url: deployedUrl, projectName: name })
  } catch (err) {
    return NextResponse.json({ error: `Deploy failed: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 500 })
  }
}
