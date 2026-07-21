import type { Sandbox } from '@vercel/sandbox'
import { generateText } from 'ai'
import { getModelOptions } from '@/ai/gateway'
import { FILE_GENERATION_MODEL, getMaxOutputTokens } from '@/ai/constants'
import { logRepair } from '@/lib/telemetry'

// ── Shared sandbox / build-repair helpers ─────────────────────────────────────
// Low-level, framework-agnostic helpers used by BOTH the main generation pipeline
// (app/api/chat/route.ts) and the resumable enrichment engine (lib/enrichment.ts).
// Extracted here so the continuation invocation (/api/runs/continue) can run the
// exact same per-phase gate/repair logic without importing the chat route module.

// Read a text file from the sandbox (streamed). Returns null if absent/unreadable.
export async function readSandboxFile(sandbox: Sandbox, path: string): Promise<string | null> {
  try {
    const stream = await sandbox.readFile({ path })
    if (!stream) return null
    const chunks: Buffer[] = []
    for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as string))
    return Buffer.concat(chunks).toString('utf8')
  } catch {
    return null
  }
}

// Pull the meaningful error lines out of a vite build log.
export function extractBuildError(log: string): string {
  const lines = log
    .replace(/##EXIT:\d+/g, '')
    .split('\n')
    .filter(l =>
      /error|Cannot find|not found|Unexpected|unexpected|postcss|Could not resolve|is not exported|Failed to|SyntaxError|Transform failed|No matching/i.test(l)
    )
    .slice(0, 25)
    .join('\n')
    .slice(0, 2000)
    .trim()
  return lines || log.replace(/##EXIT:\d+/g, '').trim().slice(-1500)
}

// Extract referenced source file paths from a build log (src/... or root configs).
export function extractErrorFiles(log: string): string[] {
  const files = new Set<string>()
  const re = /((?:src\/|\.\/src\/|\/[\w./-]*?src\/)?[\w./-]+\.(?:tsx|jsx|ts|js|css))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(log)) !== null) {
    let p = m[1]
    const srcIdx = p.indexOf('src/')
    if (srcIdx >= 0) p = p.slice(srcIdx)
    else p = p.replace(/^\.\//, '')
    if (p.startsWith('src/')) files.add(p)
    else {
      const base = p.split('/').pop() ?? ''
      if (/^(tailwind|postcss)\.config\.(js|cjs|mjs|ts)$/.test(base)) files.add(base)
    }
  }
  return [...files]
}

// ── Missing-module auto-install (generic, any package) ───────────────────────
const NODE_BUILTINS = new Set([
  'fs', 'path', 'os', 'url', 'http', 'https', 'crypto', 'stream', 'util', 'events',
  'child_process', 'buffer', 'querystring', 'zlib', 'assert', 'net', 'tls', 'dns',
])
export function extractMissingModules(log: string): string[] {
  const mods = new Set<string>()
  const patterns = [
    /Cannot find module ['"]([^'"]+)['"]/g,
    /Could not resolve ['"]([^'"]+)['"]/g,
    /Failed to resolve import ['"]([^'"]+)['"]/g,
    /Cannot find package ['"]([^'"]+)['"]/g,
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(log)) !== null) {
      const name = m[1]
      if (name.startsWith('.') || name.startsWith('/') || name.startsWith('node:')) continue
      if (NODE_BUILTINS.has(name)) continue
      const parts = name.split('/')
      const pkg = name.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
      if (/^(@[\w.-]+\/)?[\w.-]+$/.test(pkg)) mods.add(pkg)
    }
  }
  return [...mods].slice(0, 8)
}

export async function installMissingModules(sandbox: Sandbox, log: string): Promise<boolean> {
  const mods = extractMissingModules(log)
  if (mods.length === 0) return false
  console.warn('[auto-install] installing missing modules:', mods.join(', '))
  logRepair({ layer: 'auto-install', action: 'installing', detail: mods.join(', ') })
  try {
    const list = mods.map(m => `'${m.replace(/'/g, '')}'`).join(' ')
    const cmd = await sandbox.runCommand({
      detached: true,
      cmd: 'bash',
      args: ['-c', `command -v bun >/dev/null 2>&1 && bun add ${list} || pnpm add ${list}`],
    })
    await Promise.race([
      cmd.wait(),
      new Promise<void>((_, rej) => setTimeout(() => rej(new Error('install timeout')), 60_000)),
    ])
    return true
  } catch (e) {
    console.warn('[auto-install] failed (non-fatal):', e instanceof Error ? e.message : e)
    return false
  }
}

// Ask Flash to repair ONE file given the exact build error. Returns corrected
// full-file content, or null if it couldn't help.
export async function repairFile(path: string, content: string, error: string): Promise<string | null> {
  try {
    const res = await generateText({
      ...getModelOptions(FILE_GENERATION_MODEL),
      maxOutputTokens: getMaxOutputTokens(FILE_GENERATION_MODEL),
      abortSignal: AbortSignal.timeout(45_000),
      system:
        'You are a build-error repair tool. You receive ONE file and the exact build error it causes. ' +
        'Return ONLY the complete corrected file content — no markdown fences, no explanation, no commentary. ' +
        '"Cannot access \'X\' before initialization" / ReferenceError (a TEMPORAL DEAD ZONE bug): something reads X ' +
        'before X is declared at runtime. The usual cause is a hook initializer calling a function that reads a ' +
        'const/ref declared LOWER in the file (e.g. `const s = useRef(createState())` where createState() reads a ' +
        '`const H` defined after it). FIX by REORDERING so every binding is declared BEFORE anything reads it: put ' +
        'refs/consts first, then functions that use them; or make the init lazy `useState(() => makeInitial())` where ' +
        'makeInitial only reads things declared above it; or move the computation into a useEffect after mount. Keep ALL ' +
        'behaviour identical — only change ordering/init so it stops throwing. ' +
        'Hard rules: NEVER use @apply in CSS. NEVER use invented Tailwind color classes like bg-lacquer/text-gold — ' +
        'use only standard Tailwind palette (slate, amber, etc.) or scaffold tokens (bg-primary, bg-background, text-foreground) ' +
        'or inline style with CSS variables. NEVER use <svg>. Fix ONLY what causes the error; keep the rest identical. ' +
        'Output the entire file.',
      messages: [
        {
          role: 'user',
          content:
            `File: ${path}\n\nBuild error:\n${error}\n\nCurrent file content:\n${content}\n\n` +
            'Return the complete corrected file content now.',
        },
      ],
    })
    let out = res.text.trim()
    out = out.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim()
    return out.length > 5 ? out : null
  } catch {
    return null
  }
}

// Run `vite build` once, returning whether it compiled + the raw log (for repair).
export async function viteBuildOnce(sandbox: Sandbox, logPath: string): Promise<{ ok: boolean; log: string }> {
  try {
    const cmd = await sandbox.runCommand({
      detached: true,
      cmd: 'bash',
      args: ['-c', `(./node_modules/.bin/vite build 2>&1; echo "##EXIT:$?") | tee ${logPath} >/dev/null`],
    })
    await Promise.race([
      cmd.wait(),
      new Promise<void>((_, rej) => setTimeout(() => rej(new Error('build timeout')), 90_000)),
    ])
  } catch {
    /* timeout — read whatever landed */
  }
  const log = (await readSandboxFile(sandbox, logPath)) ?? ''
  const m = log.match(/##EXIT:(\d+)/)
  return { ok: m ? m[1] === '0' : false, log }
}
