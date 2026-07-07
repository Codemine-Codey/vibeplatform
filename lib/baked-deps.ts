import { Sandbox } from '@vercel/sandbox'
import { getScaffoldFiles } from '@/ai/tools/scaffold'

// Baked node_modules: unified scaffold deps installed ONCE, tarred, hosted on the
// public assets bucket. ONE tarball for all project types (website + webapp + game
// deps merged). Each fresh sandbox curls + extracts (~10-20s vs ~70s fresh install).
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

// The expanded shadcn component set generated via the official CLI.
const SHADCN_COMPONENTS = [
  'accordion', 'alert', 'alert-dialog', 'aspect-ratio', 'avatar', 'breadcrumb',
  'calendar', 'carousel', 'checkbox', 'collapsible', 'command', 'context-menu',
  'drawer', 'dropdown-menu', 'hover-card', 'menubar', 'navigation-menu', 'pagination',
  'popover', 'progress', 'radio-group', 'resizable', 'scroll-area', 'sheet',
  'skeleton', 'slider', 'sonner', 'switch', 'table', 'tabs', 'toggle', 'toggle-group',
  'tooltip', 'form',
]

// One-time (run via scripts/bake-deps.mts): install all deps (unified package.json
// includes website + game deps), generate full shadcn component set, tar node_modules
// + component source, upload to Supabase assets. Re-run whenever scaffold deps change.
export async function bakeDeps(): Promise<string> {
  const sandbox = await Sandbox.create({ timeout: 900_000, ports: [3000] })
  try {
    await sandbox.writeFiles(getScaffoldFiles().map(f => ({ path: f.path, content: Buffer.from(f.content, 'utf8') })))

    // Give the shadcn CLI a root tsconfig with the @ alias + components.json
    const rootTsconfig = JSON.stringify({
      files: [], references: [{ path: './tsconfig.app.json' }, { path: './tsconfig.node.json' }],
      compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] } },
    }, null, 2)
    const componentsJson = JSON.stringify({
      $schema: 'https://ui.shadcn.com/schema.json', style: 'default', rsc: false, tsx: true,
      tailwind: { config: 'tailwind.config.js', css: 'src/index.css', baseColor: 'slate', cssVariables: true },
      aliases: { components: '@/components', utils: '@/lib/utils', ui: '@/components/ui' },
    }, null, 2)
    await sandbox.writeFiles([
      { path: 'tsconfig.json', content: Buffer.from(rootTsconfig, 'utf8') },
      { path: 'components.json', content: Buffer.from(componentsJson, 'utf8') },
    ])

    console.log('[bake] installing deps (unified: website + game)…')
    const install = await sandbox.runCommand({
      detached: true, cmd: 'bash',
      args: ['-c', 'cd /vercel/sandbox && (command -v bun >/dev/null 2>&1 && bun install || pnpm install) && echo INSTALL_OK'],
    })
    await install.wait()

    console.log(`[bake] generating ${SHADCN_COMPONENTS.length} shadcn components…`)
    const add = await sandbox.runCommand({
      detached: true, cmd: 'bash',
      args: ['-c', `cd /vercel/sandbox && npx --yes shadcn@latest add ${SHADCN_COMPONENTS.join(' ')} --yes --overwrite 2>&1 | tail -5; ls src/components/ui | wc -l`],
    })
    console.log('[bake] shadcn add result:', (await (await add.wait()).stdout()).slice(-300))

    const tarTargets = 'node_modules src/components/ui src/lib components.json'
    console.log(`[bake] taring ${tarTargets}…`)
    const tar = await sandbox.runCommand({
      detached: true, cmd: 'bash',
      args: ['-c', `cd /vercel/sandbox && tar -czf /tmp/nm.tar.gz ${tarTargets} && du -h /tmp/nm.tar.gz`],
    })
    await tar.wait()

    const buf = await readSandboxBinary(sandbox, '/tmp/nm.tar.gz')
    if (!buf || buf.length === 0) throw new Error('tarball empty')
    console.log(`[bake] uploading ${(buf.length / 1e6).toFixed(1)}MB to ${BAKE_OBJECT}…`)

    const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? ''
    const res = await fetch(`${base}/storage/v1/object/${BAKE_BUCKET}/${BAKE_OBJECT}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/gzip', 'x-upsert': 'true' },
      body: new Uint8Array(buf),
    })
    if (!res.ok) throw new Error(`upload failed: ${res.status} ${await res.text()}`)
    return publicUrl()
  } finally {
    await sandbox.stop().catch(() => {})
  }
}

// Per fresh sandbox: download + extract the baked node_modules. Caller runs a fast
// install afterward for any extra packages the AI added (usually a no-op).
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
