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
      // '@/' is a local Vite path alias (src/) — never an npm package. Skip here;
      // stampMissingLocalAliases handles these by creating placeholder files.
      if (name.startsWith('@/')) continue
      if (NODE_BUILTINS.has(name)) continue
      const parts = name.split('/')
      const pkg = name.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
      if (/^(@[\w.-]+\/)?[\w.-]+$/.test(pkg)) mods.add(pkg)
    }
  }
  return [...mods].slice(0, 8)
}

// ── Option 2: Post-generation export contract resolver ────────────────────────
// Runs immediately after all files are written, before the first vite build.
// Scans every generated TS/TSX file for local named imports, compares against
// the actual exports in the target file, and appends `export { default as X }`
// aliases for any mismatch — deterministically, no LLM needed. This is the
// structural prevention layer: catches the pattern where the AI writes
// `import { ContactSection }` in one file and `export default function ContactSection`
// in another within the same one-pass generation, before any build error fires.
export async function resolveExportContracts(sandbox: Sandbox): Promise<number> {
  try {
    // 1. Discover all TS/TSX source files
    const findCmd = await sandbox.runCommand({
      cmd: 'bash', args: ['-c', "find src -name '*.tsx' -o -name '*.ts' | grep -v 'node_modules' | sort"],
      detached: true,
    })
    await findCmd.wait()
    const findOut = await readSandboxFile(sandbox, '/tmp/cm-findts.txt').catch(() => null)
    // Use runCommand stdout directly via a temp file
    const findCmd2 = await sandbox.runCommand({
      cmd: 'bash',
      args: ['-c', "find src -name '*.tsx' -o -name '*.ts' | grep -v 'node_modules' | sort > /tmp/cm-findts.txt"],
      detached: true,
    })
    await findCmd2.wait()
    const listRaw = await readSandboxFile(sandbox, '/tmp/cm-findts.txt')
    const tsPaths = (listRaw ?? '').split('\n').map(p => p.trim()).filter(p => p.endsWith('.tsx') || p.endsWith('.ts'))
    if (tsPaths.length === 0) return 0

    // 2. Read all files and build stem → export info map
    interface ExportInfo { path: string; hasDefault: boolean; defaultName: string | null; named: Set<string> }
    const fileContents = new Map<string, string>()
    const exportByStem = new Map<string, ExportInfo>()

    for (const p of tsPaths) {
      const content = await readSandboxFile(sandbox, p)
      if (!content) continue
      fileContents.set(p, content)

      const stem = p.split('/').pop()!.replace(/\.(tsx?|jsx?)$/, '')
      const info: ExportInfo = { path: p, hasDefault: false, defaultName: null, named: new Set() }

      // Detect default export and its name
      const dm = content.match(/export\s+default\s+(?:async\s+)?(?:function|class)\s+([A-Za-z0-9_$]+)/) ||
                 content.match(/export\s+default\s+([A-Za-z0-9_$]+)\s*;?\s*$/m)
      if (dm) { info.hasDefault = true; info.defaultName = dm[1] }
      else if (/export\s+default\b/.test(content)) { info.hasDefault = true; info.defaultName = stem }

      // Detect named exports
      for (const m of content.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z0-9_$]+)/g)) {
        if (!/export\s+default/.test(m[0])) info.named.add(m[1])
      }
      for (const m of content.matchAll(/export\s*\{([^}]*)\}/g)) {
        for (const part of m[1].split(',')) {
          const seg = part.trim()
          const asM = seg.match(/\bas\s+([A-Za-z0-9_$]+)\s*$/)
          const name = asM ? asM[1] : seg.split(/\s+/)[0]
          if (name && name !== 'default') info.named.add(name)
        }
      }
      exportByStem.set(stem, info)
    }

    // 3. Scan each file for named imports from local paths; fix mismatches
    const pendingFixes = new Map<string, string>() // path → updated content
    const namedImportRe = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g

    for (const [filePath, content] of fileContents) {
      namedImportRe.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = namedImportRe.exec(content)) !== null) {
        const importSrc = m[2]
        if (!importSrc.startsWith('.') && !importSrc.startsWith('@/')) continue
        const stem = importSrc.split('/').pop()!.replace(/\.(tsx?|jsx?)$/, '')
        const info = exportByStem.get(stem)
        if (!info) continue

        const names = m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
        for (const name of names) {
          if (info.named.has(name)) continue // already exported as named — fine
          if (!info.hasDefault) continue       // no default to alias from
          // Named import { X } but source only has default → append alias to source file
          const currentSrc = pendingFixes.get(info.path) ?? (fileContents.get(info.path) ?? '')
          const alreadyAliased = new RegExp(`export\\s*\\{[^}]*\\bdefault\\s+as\\s+${name}\\b`).test(currentSrc)
          if (alreadyAliased) continue
          pendingFixes.set(info.path, currentSrc.trimEnd() + `\nexport { default as ${name} }\n`)
          info.named.add(name) // prevent double-add for same name
        }
      }
    }

    if (pendingFixes.size === 0) return 0

    // 4. Write fixed files back to sandbox
    await sandbox.writeFiles(
      [...pendingFixes.entries()].map(([path, content]) => ({ path, content: Buffer.from(content, 'utf8') }))
    )
    const count = pendingFixes.size
    console.warn(`[export-contract] pre-fixed ${count} file(s) with named-export aliases: ${[...pendingFixes.keys()].join(', ')}`)
    logRepair({ layer: 'stamp-local-alias', action: 'export-contract-resolved', detail: `${count} files fixed proactively` })
    return count
  } catch (e) {
    console.warn('[export-contract] non-fatal error:', e instanceof Error ? e.message : e)
    return 0
  }
}

// Resolve a relative import path (e.g., './Grain', '../utils/helpers')
// against the directory of the importing file (e.g., 'src/components').
function resolveRelativePath(fromDir: string, importPath: string): string {
  const parts = fromDir ? fromDir.split('/') : []
  for (const seg of importPath.split('/')) {
    if (seg === '..') { parts.pop() }
    else if (seg !== '.') { parts.push(seg) }
  }
  return parts.join('/')
}

// Detect "Failed to resolve import" errors and deterministically create placeholder
// files for each missing local import — both @/ alias paths AND relative ./paths.
// Handles the case where the AI imported a component but forgot to generate the file.
// Creates a safe default export so vite build passes without any LLM round-trip.
export async function stampMissingLocalAliases(sandbox: Sandbox, log: string): Promise<boolean> {
  const missingPaths = new Set<string>()

  // 1. '@/' alias imports: Failed to resolve import '@/components/Foo'
  const reAlias = /Failed to resolve import ['"](@\/[^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = reAlias.exec(log)) !== null) {
    const aliasPath = m[1].replace(/^@\//, 'src/')
    const withExt = /\.(tsx?|jsx?|css|scss|sass|less)$/.test(aliasPath) ? aliasPath : aliasPath + '.tsx'
    missingPaths.add(withExt)
  }

  // 2. Relative imports: Failed to resolve import './Home.module.css' from 'src/pages/Home.tsx'
  const reRelative = /Failed to resolve import ['"](\.[^'"]+)['"] from ['"]([^'"]+)['"]/g
  let m2: RegExpExecArray | null
  while ((m2 = reRelative.exec(log)) !== null) {
    const importPath = m2[1]  // e.g., './Home.module.css' or '../utils/helpers'
    const fromFile = m2[2]    // e.g., 'src/pages/Home.tsx'
    const fromDir = fromFile.split('/').slice(0, -1).join('/')
    const resolved = resolveRelativePath(fromDir, importPath)
    const withExt = /\.(tsx?|jsx?|css|scss|sass|less|json)$/.test(resolved)
      ? resolved
      : resolved + '.tsx'
    missingPaths.add(withExt)
  }

  if (missingPaths.size === 0) return false

  const stamped: string[] = []
  for (const path of missingPaths) {
    const existing = await readSandboxFile(sandbox, path)
    if (existing && existing.trim().length > 10) continue // file already exists with content

    // Derive a component name from the filename for the placeholder
    const baseName = path.split('/').pop()?.replace(/\.(tsx?|jsx?)$/, '') ?? 'Placeholder'
    const componentName = baseName.replace(/[^A-Za-z0-9]/g, '') || 'Placeholder'

    let placeholder: string
    if (path.endsWith('.css')) {
      placeholder = '/* placeholder */\n'
    } else {
      // Export both named AND default so import { X } and import X from '...' both work
      placeholder = `export function ${componentName}() {\n  return <div data-placeholder="${componentName}" />\n}\nexport default ${componentName}\n`
    }

    try {
      const mkdir = await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', path.split('/').slice(0, -1).join('/')], detached: true })
      await mkdir.wait()
      await sandbox.writeFiles([{ path, content: Buffer.from(placeholder, 'utf8') }])
      stamped.push(path)
      logRepair({ layer: 'stamp-local-alias', action: 'created-placeholder', detail: path })
    } catch (e) {
      console.warn('[stamp-local-alias] failed for', path, e instanceof Error ? e.message : e)
    }
  }

  if (stamped.length > 0) {
    console.warn('[stamp-local-alias] created placeholders:', stamped.join(', '))
    return true
  }
  return false
}

// Detect "does not provide an export named 'X'" errors and append a re-export
// alias to the file so both default and named import styles work. This fixes the
// pattern where the AI uses `export default function Foo` but imports as `{ Foo }`.
export async function stampMissingNamedExports(sandbox: Sandbox, log: string): Promise<boolean> {
  // Matches: The requested module '/src/.../Foo.tsx' does not provide an export named 'Foo'
  const re = /The requested module ['"]([^'"]+\.tsx?)['"] does not provide an export named ['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  const patches: Array<{ path: string; name: string }> = []
  while ((m = re.exec(log)) !== null) {
    let p = m[1].replace(/^\/vercel\/sandbox\//, '')
    if (!p.startsWith('src/')) {
      const idx = p.indexOf('src/')
      if (idx >= 0) p = p.slice(idx)
    }
    if (p.startsWith('src/')) patches.push({ path: p, name: m[2] })
  }
  if (patches.length === 0) return false

  let anyPatched = false
  for (const { path, name } of patches) {
    try {
      const content = await readSandboxFile(sandbox, path)
      if (!content) continue
      // Skip if a named export already exists
      if (new RegExp(`export\\s+(function|const|class)\\s+${name}\\b`).test(content)) continue
      // Append a re-export alias: export { default as Name }
      const appended = content.trimEnd() + `\nexport { default as ${name} }\n`
      await sandbox.writeFiles([{ path, content: Buffer.from(appended, 'utf8') }])
      logRepair({ layer: 'stamp-local-alias', action: 'named-export-alias', detail: `${path}::${name}` })
      anyPatched = true
    } catch { /* non-fatal */ }
  }
  if (anyPatched) console.warn('[stamp-named-export] added named export aliases')
  return anyPatched
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

// Ask Flash to repair ALL error files in a SINGLE AI call — much faster than sequential
// one-at-a-time repair. Returns an array of { path, content } for files that were fixed,
// or null if the call failed entirely. Files that didn't need changes are omitted.
export async function repairAllFiles(
  files: Array<{ path: string; content: string }>,
  error: string
): Promise<Array<{ path: string; content: string }> | null> {
  if (files.length === 0) return null
  const filesText = files
    .map(f => `<<<FILE ${f.path}>>>\n${f.content}\n<<<END>>>`)
    .join('\n\n')
  try {
    const res = await generateText({
      ...getModelOptions(FILE_GENERATION_MODEL),
      maxOutputTokens: getMaxOutputTokens(FILE_GENERATION_MODEL),
      abortSignal: AbortSignal.timeout(90_000),
      system:
        'You are a build-error repair tool. You receive MULTIPLE files and the exact build error they cause. ' +
        'Fix ALL files needed to resolve the error in ONE response. ' +
        'Return each fixed file in this EXACT format (only include files you actually changed):\n' +
        '<<<FILE path/to/file>>>\n[full corrected file content]\n<<<END>>>\n\n' +
        'Hard rules: NEVER use @apply in CSS. NEVER use invented Tailwind color classes — ' +
        'use only standard Tailwind palette or scaffold CSS variables. NEVER use <svg>. ' +
        'Fix ONLY what causes the error; keep the rest identical. Output ONLY file blocks, nothing else.',
      messages: [
        {
          role: 'user',
          content:
            `Build error:\n${error}\n\nFiles to inspect and fix:\n\n${filesText}\n\n` +
            'Return only the corrected file blocks for any files that need changes.',
        },
      ],
    })
    const text = res.text
    const fixes: Array<{ path: string; content: string }> = []
    for (const f of files) {
      const escaped = f.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`<<<FILE ${escaped}>>>\\n([\\s\\S]*?)\\n<<<END>>>`)
      const m = text.match(re)
      if (m && m[1] && m[1].trim().length > 5) {
        fixes.push({ path: f.path, content: m[1].trim() })
      }
    }
    return fixes.length > 0 ? fixes : null
  } catch {
    return null
  }
}

// Generate a brand-new file that is missing from the sandbox (Vite "Failed to resolve import").
// Called when the headless check detects a module that was never created.
// `importerContent` is the body of the file that imports this module — used as context
// so the AI can infer the exact exports/props the missing module needs to provide.
export async function generateMissingFile(
  path: string,
  spec: string,
  importerContent: string,
): Promise<string | null> {
  try {
    const res = await generateText({
      ...getModelOptions(FILE_GENERATION_MODEL),
      maxOutputTokens: getMaxOutputTokens(FILE_GENERATION_MODEL),
      abortSignal: AbortSignal.timeout(45_000),
      system:
        'You are a React/TypeScript module generator. A Vite build failed because the file shown below does not exist. ' +
        'Create it with REAL, production-quality React/TypeScript code based on how it is used in the importing file shown. ' +
        'Infer the exact exports, types, component props, and API from the importer context. ' +
        'Match the import style (default vs named) exactly. ' +
        'Return ONLY the complete file content — no markdown fences, no explanation, no commentary. ' +
        'Hard rules: use only standard Tailwind palette + scaffold tokens (bg-primary, text-foreground etc.), ' +
        'no <svg>, no @apply in CSS, no invented Tailwind colors. Export real working code.',
      messages: [{
        role: 'user',
        content:
          `Missing file to create: ${path}\n` +
          `Import spec: ${spec}\n\n` +
          `Importing file (how this module is used):\n${importerContent.slice(0, 3000)}\n\n` +
          'Generate the complete, working file content now.',
      }],
    })
    let out = res.text.trim()
    out = out.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim()
    return out.length > 10 ? out : null
  } catch {
    return null
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
