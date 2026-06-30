import type { UIMessageStreamWriter, UIMessage } from 'ai'
import type { DataPart } from '../messages/data-parts'
import { Sandbox } from '@vercel/sandbox'
import { getContents, type File } from './generate-files/get-contents'
import { getRichError } from './get-rich-error'
import { getWriteFiles } from './generate-files/get-write-files'
import { computeMissingKnownPackages } from './generate-files/import-gate'
import { SCAFFOLD_PATH_SET } from './scaffold'
import { tool } from 'ai'
import description from './generate-files.md'
import z from 'zod/v3'

// ── Import-closure helpers ────────────────────────────────────────────────────
// The #1 cause of broken builds: the AI imports a local file (types.ts, a
// component) it never generated. These helpers find such imports so we can
// generate the missing files and guarantee the import graph is complete.

function extractLocalImports(content: string): string[] {
  const specs = new Set<string>()
  const reFrom = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]/g
  const reBare = /import\s*['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = reFrom.exec(content)) !== null) specs.add(m[1])
  while ((m = reBare.exec(content)) !== null) specs.add(m[1])
  return [...specs].filter(s => s.startsWith('./') || s.startsWith('../') || s.startsWith('@/'))
}

function resolveBase(spec: string, importerPath: string): string {
  if (spec.startsWith('@/')) return 'src/' + spec.slice(2)
  const dir = importerPath.split('/').slice(0, -1)
  for (const p of spec.split('/')) {
    if (p === '.' || p === '') continue
    else if (p === '..') dir.pop()
    else dir.push(p)
  }
  return dir.join('/')
}

function importCandidates(spec: string, importerPath: string): string[] {
  const base = resolveBase(spec, importerPath)
  const exts = ['.tsx', '.ts', '.jsx', '.js']
  const out = [base]
  for (const e of exts) out.push(base + e)
  for (const e of exts) out.push(base + '/index' + e)
  return out
}

// The concrete path we'd generate for a missing import (null = skip: external,
// css, or json — those are handled by the scaffold or not generatable as code).
function targetPathFor(spec: string, importerPath: string): string | null {
  const base = resolveBase(spec, importerPath)
  if (/\.(css|json)$/.test(base)) return null
  if (/\.(tsx|jsx|ts|js)$/.test(base)) return base
  const last = base.split('/').pop() || ''
  return /^[A-Z]/.test(last) ? base + '.tsx' : base + '.ts'
}

// Runs inside the sandbox after file generation to guarantee Vite allowedHosts.
const VITE_PATCH_SCRIPT = `
const fs = require('fs');
const configs = ['vite.config.ts','vite.config.js','vite.config.mjs','vite.config.mts'];
let done = false;
for (const f of configs) {
  if (!fs.existsSync(f)) continue;
  let s = fs.readFileSync(f, 'utf8');
  if (s.includes('allowedHosts')) { done = true; break; }
  if (/server\\s*:/.test(s)) {
    s = s.replace(/(server\\s*:\\s*\\{)/, "$1 host:'0.0.0.0', allowedHosts:true,");
  } else if (/defineConfig/.test(s)) {
    s = s.replace(/(defineConfig\\s*(?:<[^>]*>)?\\s*\\(\\s*\\{)/, "$1\\n  server:{host:'0.0.0.0',allowedHosts:true,port:3000},");
  } else {
    s = s.replace(/export\\s+default\\s*\\{/, "export default {\\n  server:{host:'0.0.0.0',allowedHosts:true,port:3000},");
  }
  fs.writeFileSync(f, s);
  console.log('cm-patch: patched ' + f);
  done = true;
  break;
}
if (!done) {
  const fallback = "import{defineConfig}from 'vite';import react from '@vitejs/plugin-react';export default defineConfig({plugins:[react()],server:{host:'0.0.0.0',allowedHosts:true,port:3000}});";
  fs.writeFileSync('vite.config.js', fallback);
  console.log('cm-patch: created vite.config.js');
}
`.trim()

interface Params {
  modelId: string
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>
  // The design contract (brief tokens + fonts + taste rules) — passed into the
  // file-writer's system prompt so generated code actually matches the design.
  designContext?: string
}

export const generateFiles = ({ writer, modelId, designContext }: Params) =>
  tool({
    description,
    inputSchema: z.object({
      sandboxId: z.string(),
      paths: z.array(z.string()),
    }),
    execute: async ({ sandboxId, paths }, { toolCallId, messages }) => {
      if (paths.length === 0) {
        return 'ERROR: paths list is empty. You must provide at least one file path to generate.'
      }

      writer.write({
        id: toolCallId,
        type: 'data-generating-files',
        data: { paths: [], status: 'generating' },
      })

      let sandbox: Sandbox | null = null

      try {
        sandbox = await Sandbox.get({ sandboxId })
      } catch (error) {
        const richError = getRichError({
          action: 'get sandbox by id',
          args: { sandboxId },
          error,
        })
        writer.write({
          id: toolCallId,
          type: 'data-generating-files',
          data: { error: richError.error, paths: [], status: 'error' },
        })
        return richError.message
      }

      const writeFiles = getWriteFiles({ sandbox, toolCallId, writer })
      const uploaded: File[] = []

      // Streaming writeFile tool calls — each file is yielded as soon as Flash
      // finishes writing it. No heartbeat needed; tokens flow continuously.
      const iterator = getContents({ messages, modelId, paths, designContext })
      try {
        for await (const chunk of iterator) {
          if (chunk.files.length > 0) {
            const error = await writeFiles({
              ...chunk,
              written: uploaded.map((f) => f.path),
            })
            if (!error) uploaded.push(...chunk.files)
          }
        }
      } catch (error) {
        const richError = getRichError({
          action: 'generate file contents',
          args: { modelId, paths },
          error,
        })
        console.error('[generateFiles] getContents error:', richError.message)
      }

      // Retry any files that were missed (JSON parse failure, empty content, etc.)
      const writtenPaths = new Set(uploaded.map(f => f.path))
      const missing = paths.filter(p => !writtenPaths.has(p))
      if (missing.length > 0) {
        console.warn(`[generateFiles] Retrying ${missing.length} missing file(s): ${missing.join(', ')}`)
        const retryIterator = getContents({ messages, modelId, paths: missing, designContext })
        try {
          for await (const chunk of retryIterator) {
            if (chunk.files.length > 0) {
              const error = await writeFiles({ ...chunk, written: uploaded.map(f => f.path) })
              if (!error) uploaded.push(...chunk.files)
            }
          }
        } catch {
          // retry failure is non-fatal
        }
      }

      // ── Import-closure pass: generate any imported file that wasn't created ──
      // Deterministically closes the import graph. Scans every generated file's
      // local imports; any referenced file that doesn't exist gets generated,
      // with the importing files as context so exports/types are inferred right.
      // Loops until no new missing files (max 2 rounds). This is the fix for the
      // "Cannot find module './types'" class of blank previews.
      try {
        for (let round = 0; round < 2; round++) {
          const existing = new Set<string>([
            ...uploaded.map(f => f.path),
            ...SCAFFOLD_PATH_SET,
          ])
          const missingMap = new Map<string, Set<string>>() // target -> importers
          for (const file of uploaded) {
            if (!/\.(tsx|jsx|ts|js)$/.test(file.path)) continue
            for (const spec of extractLocalImports(file.content)) {
              if (importCandidates(spec, file.path).some(c => existing.has(c))) continue
              const target = targetPathFor(spec, file.path)
              if (!target || SCAFFOLD_PATH_SET.has(target)) continue
              const set = missingMap.get(target) ?? new Set<string>()
              set.add(file.path)
              missingMap.set(target, set)
            }
          }
          if (missingMap.size === 0) break
          const missingPaths = [...missingMap.keys()].slice(0, 12)
          console.warn(`[closure] round ${round}: generating ${missingPaths.length} missing file(s): ${missingPaths.join(', ')}`)

          const importerPaths = new Set<string>()
          for (const p of missingPaths) for (const ip of missingMap.get(p) ?? []) importerPaths.add(ip)
          const importerSnippets = [...importerPaths]
            .map(ip => {
              const f = uploaded.find(u => u.path === ip)
              return f ? `// ${ip}\n${f.content.slice(0, 1800)}` : ''
            })
            .filter(Boolean)
            .join('\n\n')

          // The EXACT export signatures of EVERY already-generated file — so a missing
          // file (e.g. a wrapper) matches the real contracts of the components it
          // IMPORTS, not just how its consumers use it. This is the fix for closure-
          // generated files inventing a wrong prop/contract for an existing component.
          const apiSurface = uploaded
            .filter(f => /\.(tsx|ts|jsx|js)$/.test(f.path) && !SCAFFOLD_PATH_SET.has(f.path) && !missingPaths.includes(f.path))
            .map(f => {
              const lines = f.content.split('\n').filter(l => /^\s*export\s/.test(l)).map(l => l.trim().slice(0, 200))
              return lines.length ? `// ${f.path}\n${lines.join('\n')}` : ''
            })
            .filter(Boolean)
            .join('\n\n')

          const closureMessages = [
            ...messages,
            {
              role: 'user' as const,
              content:
                'These files are imported but do not exist yet. Create each one COMPLETELY so every import resolves. ' +
                'Infer the EXACT exports, types, interfaces, props, and function signatures from how they are used in the importing files shown below. ' +
                'Match the import style (default vs named) exactly. Use real, production-quality code — no stubs.\n\n' +
                'CRITICAL — match these EXISTING file signatures exactly when you import or render any of them (do NOT invent different props or a different default/named export):\n' +
                apiSurface + '\n\n' +
                'Importing files for context:\n' + importerSnippets,
            },
          ]

          let gotAny = false
          const closureIter = getContents({ messages: closureMessages, modelId, paths: missingPaths, designContext })
          try {
            for await (const chunk of closureIter) {
              if (chunk.files.length > 0) {
                const err = await writeFiles({ ...chunk, written: uploaded.map(f => f.path) })
                if (!err) { uploaded.push(...chunk.files); gotAny = true }
              }
            }
          } catch { /* non-fatal */ }
          if (!gotAny) break
        }
      } catch (e) {
        console.warn('[closure] pass failed (non-fatal):', e instanceof Error ? e.message : e)
      }

      // ── Package pre-declare gate ─────────────────────────────────────────────
      // Any allow-listed real package the AI imported but didn't declare is added
      // to package.json NOW, so the upcoming install resolves it up-front — no
      // runtime "module not found" + dev-server restart. Curated list + safe
      // versions, so this can never add a fake or React-incompatible package.
      // (Unknown packages still fall through to the runtime install catch-all.)
      try {
        let pkgRaw: string | null = null
        try {
          const stream = await sandbox.readFile({ path: 'package.json' })
          if (stream) {
            const chunks: Buffer[] = []
            for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as string))
            pkgRaw = Buffer.concat(chunks).toString('utf8')
          }
        } catch { /* no package.json readable — skip */ }

        if (pkgRaw) {
          const pkg = JSON.parse(pkgRaw)
          const declared = new Set<string>([
            ...Object.keys(pkg.dependencies ?? {}),
            ...Object.keys(pkg.devDependencies ?? {}),
          ])
          const toAdd = computeMissingKnownPackages(uploaded, declared)
          const names = Object.keys(toAdd)
          if (names.length > 0) {
            pkg.dependencies = { ...(pkg.dependencies ?? {}), ...toAdd }
            await sandbox.writeFiles([
              { path: 'package.json', content: Buffer.from(JSON.stringify(pkg, null, 2), 'utf8') },
            ])
            console.warn(`[pkg-gate] pre-declared ${names.length} package(s): ${names.join(', ')}`)
          }
        }
      } catch (e) {
        console.warn('[pkg-gate] pass failed (non-fatal):', e instanceof Error ? e.message : e)
      }

      // In-sandbox Vite patch — belt-and-suspenders after server-side patch
      try {
        await sandbox.writeFiles([
          { path: '.cm-patch.cjs', content: Buffer.from(VITE_PATCH_SCRIPT, 'utf8') },
        ])
        const patchCmd = await sandbox.runCommand({ detached: true, cmd: 'node', args: ['.cm-patch.cjs'] })
        await patchCmd.wait()
        const rmCmd = await sandbox.runCommand({ detached: true, cmd: 'rm', args: ['-f', '.cm-patch.cjs'] })
        await rmCmd.wait()
      } catch {
        // Non-fatal
      }

      writer.write({
        id: toolCallId,
        type: 'data-generating-files',
        data: { paths: uploaded.map((file) => file.path), status: 'done' },
      })

      return `Successfully generated and uploaded ${uploaded.length} files:\n${uploaded.map((f) => f.path).join('\n')}`
    },
  })
