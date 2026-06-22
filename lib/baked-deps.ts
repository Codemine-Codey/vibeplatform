import { Sandbox } from '@vercel/sandbox'
import { getAdminSupabase } from '@/lib/supabase/server'
import { SCAFFOLD_FILES } from '@/ai/tools/scaffold'

// Baked node_modules: the scaffold's dependencies are FIXED, so we install them
// ONCE, tar them, and host the archive on the public `assets` bucket. Each fresh
// sandbox then curls + extracts it (~10-20s) instead of running a full install
// (~70s). No idle sandboxes (unlike the warm pool) — just fast cold starts.
const BAKE_BUCKET = 'assets'
const BAKE_OBJECT = 'baked/node_modules.tar.gz'

function publicUrl(): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
  return `${base}/storage/v1/object/public/${BAKE_BUCKET}/${BAKE_OBJECT}`
}

async function readSandboxBinary(sandbox: Sandbox, path: string): Promise<Buffer | null> {
  try {
    const stream = await sandbox.readFile({ path })
    if (!stream) return null
    const chunks: Buffer[] = []
    for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as unknown as ArrayBuffer))
    return Buffer.concat(chunks)
  } catch {
    return null
  }
}

// One-time (run via scripts/bake-deps.mjs): build node_modules in a throwaway
// sandbox, tar it, upload to the public bucket. Returns the public URL.
export async function bakeDeps(): Promise<string> {
  const sandbox = await Sandbox.create({ timeout: 600_000, ports: [3000] })
  try {
    await sandbox.writeFiles(SCAFFOLD_FILES.map(f => ({ path: f.path, content: Buffer.from(f.content, 'utf8') })))
    console.log('[bake] installing deps…')
    const install = await sandbox.runCommand({
      detached: true, cmd: 'bash',
      args: ['-c', 'cd /vercel/sandbox && (command -v bun >/dev/null 2>&1 && bun install || pnpm install) && echo INSTALL_OK'],
    })
    await install.wait()
    console.log('[bake] taring node_modules…')
    const tar = await sandbox.runCommand({
      detached: true, cmd: 'bash',
      args: ['-c', 'cd /vercel/sandbox && tar -czf /tmp/node_modules.tar.gz node_modules && du -h /tmp/node_modules.tar.gz'],
    })
    await tar.wait()
    const buf = await readSandboxBinary(sandbox, '/tmp/node_modules.tar.gz')
    if (!buf || buf.length === 0) throw new Error('tarball empty')
    console.log(`[bake] uploading ${(buf.length / 1e6).toFixed(1)}MB…`)
    // Raw REST upload — the supabase-js client mangles large binary Buffers
    // ("Bad Request"); the raw /storage/v1/object endpoint handles them fine.
    const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? ''
    const res = await fetch(`${base}/storage/v1/object/${BAKE_BUCKET}/${BAKE_OBJECT}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/gzip',
        'x-upsert': 'true',
      },
      body: new Uint8Array(buf),
    })
    if (!res.ok) throw new Error(`upload failed: ${res.status} ${await res.text()}`)
    return publicUrl()
  } finally {
    await sandbox.stop().catch(() => {})
  }
}

// Per fresh sandbox: download + extract the baked node_modules. Returns true if
// node_modules now exists. Caller still runs a fast install afterward to pick up
// any package the AI ADDED to package.json (most generations add none → install
// is a no-op and near-instant because the deps are already present).
export async function restoreBakedDeps(sandbox: Sandbox): Promise<boolean> {
  try {
    const url = publicUrl()
    const cmd = await sandbox.runCommand({
      detached: true, cmd: 'bash',
      args: ['-c',
        `cd /vercel/sandbox && curl -fsSL "${url}" -o /tmp/nm.tar.gz && tar -xzf /tmp/nm.tar.gz && rm -f /tmp/nm.tar.gz && test -d node_modules/.bin && echo RESTORE_OK`,
      ],
    })
    const done = await cmd.wait()
    return done.exitCode === 0
  } catch {
    return false
  }
}
