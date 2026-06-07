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
import { DEFAULT_MODEL, FILE_GENERATION_MODEL } from '@/ai/constants'
import { NextResponse } from 'next/server'
import { getModelOptions } from '@/ai/gateway'
import { checkBotId } from 'botid/server'
import { tools } from '@/ai/tools'
import { generateFiles } from '@/ai/tools/generate-files'
import { planProject } from '@/ai/tools/plan-project'
import { getUnsplashBatch } from '@/ai/tools/get-unsplash-batch'
import { classifyPrompt } from '@/ai/classifier'
import { expandPrompt } from '@/ai/expander'
import { formatBrief } from '@/ai/types/project-brief'
import { getSkillPack } from '@/ai/packs'
import type { Skill } from '@/ai/types/project-brief'
import { Sandbox } from '@vercel/sandbox'
import { SCAFFOLD_FILES } from '@/ai/tools/scaffold'
import { getTemplateFiles, getTemplate } from '@/ai/templates'
import { getWarmEntry } from '@/ai/warm-pool'
import prompt from './prompt.md'

export const maxDuration = 300

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
        let templateId: string | null = null

        try {
          const classResult = await classifyPrompt(userText)
          skill = classResult.skill
          clarify = classResult.clarify
          templateId = classResult.templateId
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

        // Build system prompt: base + skill pack + brief + template note
        const templateNote = templateId
          ? `\n\n## PRE-BUILT SCAFFOLD: ${templateId}\n` +
            `Core application files are already in the sandbox. Write ONLY the personality/brand file(s).\n` +
            `Personality files: derive EVERY value from the PROJECT BRIEF. colorPalette → colors, fontPairing → fonts, brandName → all titles/names, tone → dark vs light.\n` +
            `Override every default. NEVER say "template" or "scaffold" to the user.\n`
          : ''

        const systemPrompt =
          `${prompt}\n\n## SKILL PACK — ${skill.toUpperCase()} PATTERNS\n` +
          `Apply these design and code patterns for this project type. These are non-negotiable quality standards.\n\n` +
          getSkillPack(skill) +
          `\n\n## PROJECT BRIEF (authoritative design spec — use this, do not ask clarifying questions)\n` +
          `Your first message MUST be one sentence confirming what you're building, derived from this brief. Then immediately call generateFiles.\n\n` +
          formatBrief(brief) +
          templateNote

        // ── SERVER-SIDE PIPELINE ────────────────────────────────────────────
        await runPipeline({ writer, messages, systemPrompt, templateId, skill })
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
  // Edits use Flash — patchFile/readFile are fast, precise tasks that don't need Pro reasoning.
  // Fallback (clarification / unknown skill) uses Pro — it may end up doing full generation.
  const isEdit = hasActiveSandbox(messages)
  const result = streamText({
    ...getModelOptions(isEdit ? FILE_GENERATION_MODEL : DEFAULT_MODEL),
    system: systemPrompt,
    messages: await convertToModelMessages(transformMessages(messages)),
    stopWhen: stepCountIs(30),
    maxOutputTokens: 8000,
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
  templateId,
  skill,
}: {
  writer: Writer
  messages: ChatUIMessage[]
  systemPrompt: string
  templateId: string | null
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
      sandbox = await Sandbox.create({ timeout: 600_000, ports: [3000] })
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

  // Write files: warm sandbox already has scaffold, cold sandbox needs everything
  try {
    const templateFiles = templateId ? getTemplateFiles(templateId) : []
    const filesToWrite = hadWarmSandbox
      ? templateFiles
      : [...SCAFFOLD_FILES, ...templateFiles]

    if (filesToWrite.length > 0) {
      await sandbox.writeFiles(
        filesToWrite.map(f => ({ path: f.path, content: Buffer.from(f.content, 'utf8') }))
      )
    }

    // Only start bg install for cold sandboxes (warm pool already ran it)
    if (!hadWarmSandbox) {
      sandbox
        .runCommand({ detached: true, cmd: 'pnpm', args: ['install'] })
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

  // ── Step 2: Build pipeline-specific system prompt ─────────────────────────
  const tmpl = templateId ? getTemplate(templateId) : null
  const isTemplate = tmpl !== null
  const scaffoldPaths = SCAFFOLD_FILES.map(f => f.path).join(', ')

  let pipelineAddendum: string

  if (isTemplate && tmpl) {
    const scaffoldPaths = tmpl.scaffoldFiles.map(f => f.path)
    pipelineAddendum =
      `\n\n## SERVER PIPELINE — WORKSPACE READY\n` +
      `sandboxId: ${sandboxId}\n` +
      `Scaffold + pre-built files are already written. pnpm install is running in background.\n` +
      `DO NOT call createSandbox — it is already done.\n` +
      `DO NOT call runCommand or getSandboxURL — the server handles those after you finish.\n` +
      `DO NOT call planProject — the plan is fixed for this scaffold.\n\n` +
      `PERSONALITY FILES TO WRITE (the ONLY files you may pass to generateFiles):\n` +
      tmpl.personalityFiles.map(p => `  - ${p}`).join('\n') + '\n\n' +
      `BANNED — DO NOT include these in generateFiles (they are pre-built and will be ignored):\n` +
      scaffoldPaths.map(p => `  - ${p}`).join('\n') + '\n\n' +
      `${tmpl.instruction}\n\n` +
      `MANDATORY PERSONALITY RULES:\n` +
      `1. Brand name → exact brandName from the PROJECT BRIEF above\n` +
      `2. Colors → derived entirely from brief colorPalette + tone. A request for "off-white" gets off-white. Cyberpunk gets neon. Steakhouse gets dark warm. Override every default.\n` +
      `3. Fonts → match brief fontPairing exactly\n` +
      `4. All copy → written specifically for this brand, zero generic placeholders\n` +
      `5. Every field must reflect the actual project — treat template defaults as examples, not values to keep\n\n` +
      `YOUR ONLY JOB: call generateFiles with sandboxId="${sandboxId}" and paths=[${tmpl.personalityFiles.map(p => `"${p}"`).join(', ')}]. Nothing else.`
  } else {
    pipelineAddendum =
      `\n\n## SERVER PIPELINE — WORKSPACE READY\n` +
      `sandboxId: ${sandboxId}\n` +
      `Scaffold pre-written. pnpm install running in background.\n` +
      `DO NOT call createSandbox — it is already done.\n` +
      `DO NOT call runCommand or getSandboxURL — the server handles those after you finish.\n` +
      `Scaffold files already written (exclude from generateFiles paths): ${scaffoldPaths}\n\n` +
      `WORKFLOW: ${skill === 'website' ? '(1) call getUnsplashBatch for all images, (2) call planProject with complete file list, (3) call generateFiles with sandboxId="' + sandboxId + '" and all files' : '(1) call planProject with complete file list, (2) call generateFiles with sandboxId="' + sandboxId + '" and all files'}`
  }

  const fullSystem = systemPrompt + pipelineAddendum

  // ── Step 3: AI generates file contents (one focused call, limited tools) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipelineTools: Record<string, any> = isTemplate
    ? { generateFiles: generateFiles({ writer, modelId: FILE_GENERATION_MODEL, allowedPaths: tmpl!.personalityFiles }) }
    : skill === 'website'
    ? {
        generateFiles: generateFiles({ writer, modelId: FILE_GENERATION_MODEL }),
        planProject: planProject(),
        getUnsplashBatch: getUnsplashBatch(),
      }
    : {
        generateFiles: generateFiles({ writer, modelId: FILE_GENERATION_MODEL }),
        planProject: planProject(),
      }

  // Template: text + 1 generateFiles call = 3 steps max (Flash — simple personality fill)
  // From-scratch website: text + getUnsplashBatch + planProject + generateFiles (Pro — complex multi-file)
  // From-scratch app/game: text + planProject + generateFiles (Pro — complex multi-file)
  const maxSteps = isTemplate ? 3 : skill === 'website' ? 6 : 4
  const generationModel = isTemplate ? FILE_GENERATION_MODEL : DEFAULT_MODEL

  const aiResult = streamText({
    ...getModelOptions(generationModel),
    system: fullSystem,
    messages: await convertToModelMessages(transformMessages(messages)),
    stopWhen: stepCountIs(maxSteps),
    maxOutputTokens: isTemplate ? 2500 : 8000,
    tools: pipelineTools,
    onError: error => console.error('Pipeline AI error:', error),
  })

  writer.merge(aiResult.toUIMessageStream({ sendReasoning: false, sendStart: false }))

  // Wait for all AI steps (text + all tool calls) to complete
  try {
    await aiResult.text
  } catch {
    return // AI failed — abort pipeline, leave writer open for any partial output
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

  // ── Step 4: Server finalizes pnpm install ─────────────────────────────────
  // Background install from Step 1 should be nearly done (AI took 25-35s, install
  // takes 15-20s). Running it again verifies and is fast for already-installed packages.
  // 90s timeout prevents hanging if the sandbox has a network hiccup.
  writer.write({
    id: 'srv-install',
    type: 'data-run-command',
    data: { sandboxId, command: 'pnpm', args: ['install'], status: 'waiting' },
  })
  try {
    const installCmd = await sandbox.runCommand({
      detached: true,
      cmd: 'pnpm',
      args: ['install'],
    })
    await Promise.race([
      installCmd.wait(),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('pnpm install timed out')), 90_000)
      ),
    ])
    writer.write({
      id: 'srv-install',
      type: 'data-run-command',
      data: { sandboxId, command: 'pnpm', args: ['install'], status: 'done', exitCode: 0 },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'install failed'
    writer.write({
      id: 'srv-install',
      type: 'data-run-command',
      data: {
        sandboxId,
        command: 'pnpm',
        args: ['install'],
        error: { message },
        status: 'error',
      },
    })
    // pnpm install failure is non-fatal — pnpm dev may still work if packages were
    // already installed by the background install from Step 1.
  }

  // ── Step 5: Server starts pnpm dev (background — runs forever) ────────────
  writer.write({
    id: 'srv-dev',
    type: 'data-run-command',
    data: { sandboxId, command: 'pnpm', args: ['dev'], status: 'executing' },
  })
  try {
    const devCmd = await sandbox.runCommand({
      detached: true,
      cmd: 'pnpm',
      args: ['dev'],
    })
    writer.write({
      id: 'srv-dev',
      type: 'data-run-command',
      data: {
        sandboxId,
        commandId: devCmd.cmdId,
        command: 'pnpm',
        args: ['dev'],
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
        command: 'pnpm',
        args: ['dev'],
        error: { message },
        status: 'error',
      },
    })
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
