import { type ChatUIMessage } from '@/components/chat/types'
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
} from 'ai'
import type { UIMessage, UIMessageStreamWriter } from 'ai'
import type { DataPart } from '@/ai/messages/data-parts'
import { DEFAULT_MODEL, FILE_GENERATION_MODEL, EDIT_MODEL } from '@/ai/constants'
import { NextResponse } from 'next/server'
import { getModelOptions } from '@/ai/gateway'
import { checkBotId } from 'botid/server'
import { tools } from '@/ai/tools'
import { generateFiles } from '@/ai/tools/generate-files'
import { getUnsplashBatch } from '@/ai/tools/get-unsplash-batch'
import { planProject } from '@/ai/tools/plan-project'
import { classifyPrompt } from '@/ai/classifier'
import { expandPrompt } from '@/ai/expander'
import { formatBrief } from '@/ai/types/project-brief'
import { getSkillPack } from '@/ai/packs'
import type { Skill } from '@/ai/types/project-brief'
import { Sandbox } from '@vercel/sandbox'
import { SCAFFOLD_FILES, getScaffoldFiles } from '@/ai/tools/scaffold'
import { getWarmEntry } from '@/ai/warm-pool'
import prompt from './prompt.md'

export const maxDuration = 800

type Writer = UIMessageStreamWriter<UIMessage<never, DataPart>>

interface BodyData {
  messages: ChatUIMessage[]
}

function getLastUserText(messages: ChatUIMessage[]): string {
  const last = [...messages].reverse().find(m => m.role === 'user')
  if (!last) return ''
  return last.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map(p => p.text)
    .join(' ')
    .trim()
}

function hasActiveSandbox(messages: ChatUIMessage[]): boolean {
  return messages.some(
    msg =>
      Array.isArray(msg.parts) && msg.parts.some(p => p.type === 'data-create-sandbox')
  )
}

// Scans message history to extract sandboxId + every file generated so far.
// Injected into edit-turn system prompt so AI knows exactly what files exist.
function getProjectContext(messages: ChatUIMessage[]): { sandboxId: string | null; filePaths: string[] } {
  let sandboxId: string | null = null
  const seen = new Set<string>()
  const filePaths: string[] = []

  for (const msg of messages) {
    if (!Array.isArray(msg.parts)) continue
    for (const part of msg.parts) {
      if (
        part.type === 'data-create-sandbox' &&
        part.data?.sandboxId
      ) {
        sandboxId = part.data.sandboxId
      }
      if (
        part.type === 'data-generating-files' &&
        part.data?.status === 'done' &&
        Array.isArray(part.data?.paths)
      ) {
        for (const p of part.data.paths as string[]) {
          if (!seen.has(p)) {
            seen.add(p)
            filePaths.push(p)
          }
        }
      }
    }
  }

  return { sandboxId, filePaths }
}

function transformMessages(messages: ChatUIMessage[]): ChatUIMessage[] {
  return messages.map(message => {
    message.parts = message.parts.map(part => {
      if (part.type === 'data-report-errors') {
        return {
          type: 'text' as const,
          text:
            `There are errors in the generated code. This is the summary of the errors we have:\n` +
            `\`\`\`${part.data.summary}\`\`\`\n` +
            (part.data.paths?.length
              ? `The following files may contain errors:\n` +
                `\`\`\`${part.data.paths?.join('\n')}\`\`\`\n`
              : '') +
            `Fix the errors reported.`,
        }
      }
      return part
    })
    return message
  })
}

export async function POST(req: Request) {
  const [checkResult, { messages }] = await Promise.all([
    checkBotId(),
    req.json() as Promise<BodyData>,
  ])

  if (checkResult.isBot) {
    return NextResponse.json({ error: `Bot detected` }, { status: 403 })
  }

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      originalMessages: messages,
      execute: async ({ writer }) => {
        // ── EDIT MODE: sandbox already active → standard agentic loop ──────
        if (hasActiveSandbox(messages)) {
          return runAgenticLoop({ writer, messages, systemPrompt: prompt })
        }

        // ── NEW PROJECT: classify + expand ──────────────────────────────────
        const userText = getLastUserText(messages)
        if (!userText) {
          return runAgenticLoop({ writer, messages, systemPrompt: prompt })
        }

        let skill: Skill | null = null
        let clarify = false

        try {
          const classResult = await classifyPrompt(userText)
          skill = classResult.skill
          clarify = classResult.clarify
        } catch {
          // Classification failed — fallback to agentic loop
        }

        if (clarify || !skill) {
          return runAgenticLoop({ writer, messages, systemPrompt: prompt })
        }

        let brief = null
        try {
          brief = await expandPrompt(userText, skill)
        } catch {
          // Expansion failed — fallback
        }

        if (!brief) {
          return runAgenticLoop({ writer, messages, systemPrompt: prompt })
        }

        // Build system prompt: base + skill pack + brief
        const systemPrompt =
          `${prompt}\n\n## SKILL PACK — ${skill.toUpperCase()} PATTERNS\n` +
          `Apply these design and code patterns for this project type. These are non-negotiable quality standards.\n\n` +
          getSkillPack(skill) +
          `\n\n## PROJECT BRIEF (authoritative design spec — use this, do not ask clarifying questions)\n` +
          `Your first message MUST be one sentence confirming what you're building, derived from this brief. Then immediately call generateFiles.\n\n` +
          formatBrief(brief)

        // ── SERVER-SIDE PIPELINE ────────────────────────────────────────────
        await runPipeline({ writer, messages, systemPrompt, skill })
      },
    }),
  })
}

// ── Standard agentic loop (edits, clarification fallback, unknown skill) ─────
async function runAgenticLoop({
  writer,
  messages,
  systemPrompt,
}: {
  writer: Writer
  messages: ChatUIMessage[]
  systemPrompt: string
}) {
  // Edits use Haiku — patchFile/readFile are surgical tasks; fast + cheap beats powerful.
  // Fallback (clarification / unknown skill) uses Pro — it may end up doing full generation.
  const isEdit = hasActiveSandbox(messages)

  // For edit turns: inject file tree + sandboxId so AI knows exactly what exists
  let resolvedSystemPrompt = systemPrompt
  if (isEdit) {
    const { sandboxId, filePaths } = getProjectContext(messages)
    if (sandboxId && filePaths.length > 0) {
      resolvedSystemPrompt +=
        `\n\n## YOUR CURRENT PROJECT\n` +
        `sandboxId: ${sandboxId}\n\n` +
        `Files in this project (these all exist — use readFile + patchFile to edit them):\n` +
        filePaths.map(p => `- ${p}`).join('\n') +
        `\n\nScaffold files that also exist (do NOT regenerate): package.json, vite.config.ts, tailwind.config.js, postcss.config.js, tsconfig.json, src/lib/utils.ts, src/components/ui/*`
    }
  }

  const result = streamText({
    ...getModelOptions(isEdit ? EDIT_MODEL : DEFAULT_MODEL),
    system: resolvedSystemPrompt,
    messages: await convertToModelMessages(transformMessages(messages)),
    stopWhen: stepCountIs(30),
    maxOutputTokens: 16000,
    tools: tools({ modelId: FILE_GENERATION_MODEL, writer }),
    onError: error => {
      console.error('Error communicating with AI')
      console.error(JSON.stringify(error, null, 2))
    },
  })
  result.consumeStream()
  writer.merge(result.toUIMessageStream({ sendReasoning: false, sendStart: false }))
}

// ── Server-side generation pipeline ──────────────────────────────────────────
// All tool decisions (createSandbox, pnpm install, pnpm dev, getSandboxURL) are
// made by the server. The AI's only job is to generate file contents. This
// eliminates 5-6 LLM orchestration steps (~40-60s each) from the critical path.
async function runPipeline({
  writer,
  messages,
  systemPrompt,
  skill,
}: {
  writer: Writer
  messages: ChatUIMessage[]
  systemPrompt: string
  skill: Skill
}) {
  // ── Step 1: Acquire sandbox (warm pool or fresh creation) ─────────────────
  writer.write({
    id: 'srv-sandbox',
    type: 'data-create-sandbox',
    data: { status: 'loading' },
  })

  let sandbox: Sandbox
  let hadWarmSandbox = false

  const warm = getWarmEntry()
  if (warm) {
    sandbox = warm.sandbox
    hadWarmSandbox = true
  } else {
    try {
      sandbox = await Sandbox.create({ timeout: 1_200_000, ports: [3000] })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      writer.write({
        id: 'srv-sandbox',
        type: 'data-create-sandbox',
        data: { error: { message }, status: 'error' },
      })
      return
    }
  }

  const sandboxId = sandbox.sandboxId

  // Write scaffold files for cold sandboxes (warm pool already has them)
  try {
    if (!hadWarmSandbox) {
      await sandbox.writeFiles(
        getScaffoldFiles(skill).map(f => ({ path: f.path, content: Buffer.from(f.content, 'utf8') }))
      )
      sandbox
        .runCommand({ detached: true, cmd: 'bash', args: ['-c', 'command -v bun >/dev/null 2>&1 && bun install || pnpm install'] })
        .then(cmd => cmd.wait())
        .catch(() => {})
    }
  } catch {
    // Non-fatal — AI generates without scaffold if write fails
  }

  writer.write({
    id: 'srv-sandbox',
    type: 'data-create-sandbox',
    data: { sandboxId, status: 'done' },
  })

  // ── Step 2: Build pipeline addendum ─────────────────────────────────────
  const scaffoldFiles = getScaffoldFiles(skill)
  const scaffoldPaths = scaffoldFiles.map(f => f.path).join(', ')
  const pipelineAddendum =
    `\n\n## SERVER PIPELINE — WORKSPACE READY\n` +
    `sandboxId: ${sandboxId}\n` +
    `Scaffold pre-written (including shadcn/ui components). Dependencies installing in background.\n` +
    `DO NOT call createSandbox — it is already done.\n` +
    `DO NOT call runCommand or getSandboxURL — the server handles those after you finish.\n` +
    `Scaffold files already written (exclude from generateFiles paths): ${scaffoldPaths}\n\n` +
    `WORKFLOW: ${skill === 'website'
      ? `(1) call getUnsplashBatch for all images in parallel with your first message, (2) call planProject with the complete file list (every file path you will generate), (3) call generateFiles with sandboxId="${sandboxId}" and exactly the paths from planProject`
      : `(1) call planProject with the complete file list (every path you will generate), (2) call generateFiles with sandboxId="${sandboxId}" and exactly the paths from planProject`}\n` +
    (skill !== 'website' ? `getUnsplashBatch is NOT available for this skill type — do not call it.\n` : '') +
    `If you need packages not in the scaffold, include package.json in your generateFiles paths.\n`

  const fullSystem = systemPrompt + pipelineAddendum

  // ── Step 3: AI generates directly — no planning round-trip ───────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipelineTools: Record<string, any> = skill === 'website'
    ? {
        generateFiles: generateFiles({ writer, modelId: FILE_GENERATION_MODEL }),
        getUnsplashBatch: getUnsplashBatch(),
        planProject: planProject(),
      }
    : {
        generateFiles: generateFiles({ writer, modelId: FILE_GENERATION_MODEL }),
        planProject: planProject(),
      }

  // website: text + getUnsplashBatch + planProject + generateFiles (max 4 steps)
  // app/game: text + planProject + generateFiles (3 steps)
  const maxSteps = skill === 'website' ? 4 : 3

  const aiResult = streamText({
    ...getModelOptions(DEFAULT_MODEL),
    system: fullSystem,
    messages: await convertToModelMessages(transformMessages(messages)),
    stopWhen: stepCountIs(maxSteps),
    maxOutputTokens: 16000,
    tools: pipelineTools,
    onError: error => console.error('Pipeline AI error:', error),
  })

  writer.merge(aiResult.toUIMessageStream({ sendReasoning: false, sendStart: false }))

  // Wait for all AI steps (text + all tool calls) to complete
  try {
    await aiResult.text
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Pipeline AI failed:', msg)
    writer.write({
      id: 'srv-error',
      type: 'data-report-errors',
      data: { summary: `Generation failed: ${msg}. Please try again.`, paths: [] },
    })
    return
  }

  // Verify generateFiles was actually called — if AI only produced text (rare edge case),
  // skip pnpm commands to avoid starting an empty sandbox.
  try {
    const allSteps = await aiResult.steps
    const calledGenerateFiles = allSteps.some(
      step =>
        Array.isArray(step.toolCalls) &&
        (step.toolCalls as Array<{ toolName: string }>).some(
          tc => tc.toolName === 'generateFiles'
        )
    )
    if (!calledGenerateFiles) {
      console.warn('Pipeline: AI did not call generateFiles — aborting pnpm phase')
      return
    }
  } catch {
    // Can't verify — proceed anyway
  }

  // ── Step 4: Server finalizes install ─────────────────────────────────────
  // Background install from Step 1 should be nearly done. Re-running is fast
  // for already-installed packages. 90s timeout covers cold installs.
  writer.write({
    id: 'srv-install',
    type: 'data-run-command',
    data: { sandboxId, command: 'bun', args: ['install'], status: 'waiting' },
  })
  try {
    const installCmd = await sandbox.runCommand({
      detached: true,
      cmd: 'bash',
      args: ['-c', 'command -v bun >/dev/null 2>&1 && bun install || pnpm install'],
    })
    await Promise.race([
      installCmd.wait(),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('install timed out')), 90_000)
      ),
    ])
    writer.write({
      id: 'srv-install',
      type: 'data-run-command',
      data: { sandboxId, command: 'bun', args: ['install'], status: 'done', exitCode: 0 },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'install failed'
    writer.write({
      id: 'srv-install',
      type: 'data-run-command',
      data: {
        sandboxId,
        command: 'bun',
        args: ['install'],
        error: { message },
        status: 'error',
      },
    })
    // Non-fatal — dev server may still work if background install finished.
  }

  // ── Step 5: Server starts dev server (background — runs forever) ──────────
  writer.write({
    id: 'srv-dev',
    type: 'data-run-command',
    data: { sandboxId, command: 'bun', args: ['run', 'dev'], status: 'executing' },
  })
  try {
    const devCmd = await sandbox.runCommand({
      detached: true,
      cmd: 'bash',
      args: ['-c', 'command -v bun >/dev/null 2>&1 && bun run dev || pnpm dev'],
    })
    writer.write({
      id: 'srv-dev',
      type: 'data-run-command',
      data: {
        sandboxId,
        commandId: devCmd.cmdId,
        command: 'bun',
        args: ['run', 'dev'],
        status: 'running',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'dev server failed to start'
    writer.write({
      id: 'srv-dev',
      type: 'data-run-command',
      data: {
        sandboxId,
        command: 'bun',
        args: ['run', 'dev'],
        error: { message },
        status: 'error',
      },
    })
  }

  // ── Step 5.5: Server-side CSS sanity check — auto-fix before preview ────────
  // Catches the two most common fatal issues without an extra AI round-trip.
  try {
    const cssStream = await sandbox.readFile({ path: 'src/index.css' })
    if (cssStream) {
      const chunks: Buffer[] = []
      for await (const c of cssStream) {
        chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as string))
      }
      let css = Buffer.concat(chunks).toString('utf8')
      let changed = false

      // Fix 1: wrong tailwind import syntax → correct directives
      if (css.includes("@import 'tailwindcss/base'") || css.includes('@import "tailwindcss/base"')) {
        css = css
          .replace(/@import ['"]tailwindcss\/base['"]\s*;?/g, '@tailwind base;')
          .replace(/@import ['"]tailwindcss\/components['"]\s*;?/g, '@tailwind components;')
          .replace(/@import ['"]tailwindcss\/utilities['"]\s*;?/g, '@tailwind utilities;')
        changed = true
        console.warn('[css-check] Fixed wrong @import tailwindcss syntax')
      }

      // Fix 2: no :root block → append minimal CSS variable defaults so page isn't blank
      if (!css.includes(':root')) {
        css += `\n:root {\n  --background: 0 0% 100%;\n  --foreground: 222.2 84% 4.9%;\n  --primary: 221.2 83.2% 53.3%;\n  --primary-foreground: 210 40% 98%;\n  --secondary: 210 40% 96.1%;\n  --secondary-foreground: 222.2 47.4% 11.2%;\n  --muted: 210 40% 96.1%;\n  --muted-foreground: 215.4 16.3% 46.9%;\n  --accent: 210 40% 96.1%;\n  --accent-foreground: 222.2 47.4% 11.2%;\n  --destructive: 0 84.2% 60.2%;\n  --destructive-foreground: 210 40% 98%;\n  --border: 214.3 31.8% 91.4%;\n  --input: 214.3 31.8% 91.4%;\n  --ring: 221.2 83.2% 53.3%;\n  --radius: 0.5rem;\n}\n* { border-color: hsl(var(--border)); }\nbody { background-color: hsl(var(--background)); color: hsl(var(--foreground)); }\n`
        changed = true
        console.warn('[css-check] Appended missing :root CSS variables')
      }

      if (changed) {
        await sandbox.writeFiles([{ path: 'src/index.css', content: Buffer.from(css, 'utf8') }])
      }
    }
  } catch {
    // Non-fatal — proceed even if CSS check fails
  }

  // ── Step 6: Wait for Vite to be ready, then return URL ────────────────────
  // pnpm dev started in background (detached) — Vite takes 5-15s to boot.
  // Poll the sandbox URL until we get a non-502 response, then emit to client.
  // This prevents the iframe loading before the port is actually listening.
  writer.write({
    id: 'srv-url',
    type: 'data-get-sandbox-url',
    data: { status: 'loading' },
  })
  const url = sandbox.domain(3000)
  await waitForDevServer(url)
  writer.write({
    id: 'srv-url',
    type: 'data-get-sandbox-url',
    data: { url, status: 'done' },
  })
}

// Poll the sandbox URL until the dev server responds (non-502 = port is listening).
// Times out after maxWaitMs and emits URL anyway — preview's "Try again" handles it.
async function waitForDevServer(url: string, maxWaitMs = 45_000): Promise<void> {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
      if (res.status !== 502) return
    } catch {
      // AbortError, network error — not ready yet
    }
    await new Promise(r => setTimeout(r, 2500))
  }
}
