# Codemine — Build Tasks

Status: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` known issue

---

## PHASE 0 — Foundation ✅ COMPLETE

### Repo & Fork
- [x] Repo created: github.com/Codemine-Codey/vibeplatform (Codemine-Codey account)
- [x] OSS vibe-coding-platform files sparse-checked from vercel/examples (119 files)
- [x] CLAUDE.md, TASKS.md, .env.example added and committed
- [x] pnpm install — all dependencies installed

### Model Swap (OSS used Claude/GPT/Grok → we use DeepSeek)
- [x] ai/constants.ts — DEFAULT_MODEL='deepseek-v4-pro', FILE_GENERATION_MODEL='deepseek-v4-flash'
- [x] ai/gateway.ts — createOpenAI with .chat() to force Chat Completions (DeepSeek doesn't support Responses API)
- [x] ai/tools/generate-files/get-contents.ts — rewritten: generateText + tool calls (Output.object requires Responses API)
- [x] app/api/errors/route.ts — rewritten: tool-call based error analysis
- [x] app/api/chat/route.ts — maxDuration=300, stopWhen stepCountIs(25), removed messageMetadata spam, simplified body

### System Prompt
- [x] app/api/chat/prompt.md — full rewrite: VibePlatform identity, confidentiality rules, design rules, 3 skill types, workflow, error UX rules
- [x] Added: all files in ONE generateFiles call (prevents missing component errors)
- [x] Added: never show raw errors to user — plain English only
- [x] Added: strict code quality — production-ready on first attempt

### UI Cleanup
- [x] app/header.tsx — VibePlatform branding (ZapIcon), Vercel logo removed
- [x] components/settings/model-selector.tsx — returns null (users don't pick model)
- [x] components/settings/reasoning-effort.tsx — returns null (GPT-only feature)
- [x] components/settings/use-settings.ts — simplified (fixErrors only)
- [x] app/chat.tsx — removed ModelSelector, removed modelId/reasoningEffort from sendMessage
- [x] components/modals/welcome.tsx — VibePlatform copy, no Vercel/Claude/GPT mentions
- [x] components/banner.tsx — VibePlatform Beta copy
- [x] app/page.tsx — panel layout 34/33/33 (was 33.33×3=99.99, caused console warning)

### Bug Fixes (Phase 0 compatibility)
- [x] React max update depth — chat-context.tsx onData wrapped in setTimeout(fn,0)
- [x] File generation batch — get-contents.ts yields ALL files in one chunk (not per-file loop)
- [x] messageMetadata removed from toUIMessageStream (was firing per token, not per message)

### Verified Working
- [x] TypeScript: zero errors
- [x] DeepSeek API connects (POST /api/chat 200)
- [x] Vercel Sandbox spins up (createSandbox tool executes)
- [x] Files generate (generateFiles tool executes)
- [x] Commands run (pnpm install, pnpm dev execute in sandbox)
- [x] Preview URL returned (getSandboxUrl tool executes)
- [x] Full generation: 2.9 min, no server errors
- [x] No React update depth error in browser

### Remaining Phase 0 Items
- [x] Preview auto-refreshes after AI uploads files (3s delay, state.ts + preview.tsx)
- [x] Universal code quality rules strengthened (single source of truth, resize consistency)
- [x] UI redesign: 36/64 split, tabbed right panel (Preview/Code/Logs), off-white bg, Inter font
- [x] Skill-specific system prompts: website, webapp, game — Bolt/Lovable-level detail with explicit anti-patterns
- [x] Pre-launch bug hardening (round 1): update depth fix, error handling, cleanup, API key validation, stale closure fix
- [x] Pre-launch bug hardening (round 2): command-logs.tsx fixes, addLog upsert, fetch timeouts, "terminated" error handling, Sandbox→Codemine UI rename
- [x] Set up Cloudflare AI Gateway — AI_GATEWAY_BASE_URL in .env.local (account 8b557a24d9314c5895645b698428ea31, gateway: codemine)
- [x] Get Unsplash API key — UNSPLASH_ACCESS_KEY in .env.local
- [ ] Get Cloudflare API token (Pages:Edit + D1:Edit permissions) — needed for Phase 2
- [ ] Deploy to Vercel production (vercel --prod)

> OIDC token expires — re-run `vercel env pull .env.local --yes` then re-add DEEPSEEK_API_KEY + OPENROUTER_API_KEY after pulling if sandbox auth fails.

---

## PHASE 1 — Prompt Intelligence + Skill System ✅ COMPLETE

### 1a. Prompt Expansion Pipeline

The full pre-generation flow before any tool calls:

```
User prompt
    ↓ Flash (~1s)
Intent Classifier → { skill, clarify?, question? }
    ↓ (if clarify → show question → get answer)
    ↓ Flash (~2s)
Prompt Expander → ProjectBrief { name, skill, colors, typography, sections[], features[], techNotes }
    ↓
Show user: "Building [X] with [Y] — starting now..."
    ↓
Main generation (v4 Pro) with full ProjectBrief as context
```

Tasks:
- [x] Create `ai/classifier.ts` — DeepSeek Flash, returns `{ skill, clarify, question? }`
- [x] Create `ai/expander.ts` — DeepSeek Flash, turns prompt → `ProjectBrief` object
- [x] Define `ProjectBrief` type (name, skill, colorPalette, fontPairing, sections/features, tone, brandPersonality)
- [x] Wire pipeline in `app/api/chat/route.ts`: classify → expand → inject brief into system prompt
- [x] Confirmation line: AI says it in its first message based on brief context
- [ ] Test with diverse prompts (Playwright)

### 1b. New Tools
- [x] `ai/tools/read-file.ts` — reads file via sandbox cat, returns content
- [x] `ai/tools/patch-file.ts` — targeted string replace (read → replace → writeFiles)
- [x] `ai/tools/get-unsplash.ts` — keyword → Unsplash API → real URL (fallback to curated IDs)
- [x] Registered all new tools in `ai/tools/index.ts`

### 1c. Project Context Memory — deferred to Phase 3
- [ ] Create ai/context.ts
  - [ ] readProjectContext(sandboxId) — reads _project_context.md from sandbox root
  - [ ] writeProjectContext(sandboxId, context) — writes/updates context file
  - [ ] initProjectContext(sandboxId, skill, userIntent) — creates fresh context
- [ ] Context schema: type, userIntent, stack, styleDecisions, sectionsBuilt, changelog (last 5), fileTree
- [ ] Inject context read as mandatory first step in system prompt

### 1d. Three Skill System Prompts
Research: github.com/dontriskit/awesome-ai-system-prompts (Lovable, v0, same.new, Bolt.new prompts)

- [x] Skill rules embedded in `app/api/chat/prompt.md` — website, webapp, game each have full sections
- [x] Classifier → skill type detected → injected into ProjectBrief → guides generation
- [ ] Quality review: test 3 prompts per skill type (Playwright)

---

## PHASE 1.5 — Quality & Reliability Improvements ✅ COMPLETE

### Platform rename & identity
- [x] Rename platform to Codemine everywhere (UI, prompts, metadata, package.json, storage keys)
- [x] AI never mentions DeepSeek, Gemini, Claude, ChatGPT, Unsplash, Cloudflare, Vercel
- [x] Storage keys: `vp_` → `cm_`

### UI improvements
- [x] CubeLoader 3D spinning cube overlay on preview during generation (white background)
- [x] Elapsed timer in chat: "Thinking..." < 60s → "Building your project..." ≥ 60s
- [x] Cube spacing increased (gap-20 between cube and text)
- [x] Maximum update depth fix — rAF batching in chat.tsx + error-monitor.tsx, removed experimental_throttle

### Design rules
- [x] No 3-column cards, no SVG, careful typography (max 4 type sizes, weight hierarchy), color derivation rules
- [x] Unsplash tool: one call per slot, no retrying, no naming service, renamed "Get Image"
- [x] Skill packs: ai/packs/website.md, webapp.md, game.md injected into system prompt

### Plan A — Image quality ✅
- [x] UNSPLASH_ACCESS_KEY added to .env.local
- [x] Unsplash tool rules: one call per slot, no retry, keyword choice rules

### Plan B — Streaming file-by-file generation ✅
- [x] `get-contents.ts`: async channel pattern — yields each file immediately when tool executes
- [x] `get-contents.ts`: push(null) on rejection — prevents infinite deadlock if generateText fails

### Plan C — In-sandbox Vite allowedHosts patch ✅
- [x] `VITE_PATCH_SCRIPT` defined and wired in `generate-files.ts`
- [x] After all files written: `sandbox.writeFiles(.cm-patch.cjs)` + `runCommand(node .cm-patch.cjs)` + cleanup
- [x] `patch-file.ts`: re-applies `ensureViteAllowedHosts()` after any patchFile call on vite config

### Plan D — Preview error bridge ✅
- [x] `get-write-files.ts`: inject `window.onerror` + `unhandledrejection` + `console.error` → `postMessage` into `index.html`
- [x] `app/state.ts`: `addBrowserError(msg)` creates synthetic stderr log on `cm-browser-console` command
- [x] `app/preview.tsx`: `window.addEventListener('message')` → `addBrowserError` for `cm-error` type messages

### Multi-model routing ✅
- [x] Claude Sonnet 4.6 via OpenRouter for new project generation (ORCHESTRATION_MODEL)
- [x] Gemini 3.5 Flash via OpenRouter as rate-limit fallback (FALLBACK_MODEL)
- [x] DeepSeek V4 Flash direct API for iterations/edits/chat (ITERATION_MODEL)
- [x] Prompt caching: `cache_control` injected in OpenRouter fetch for Sonnet; DeepSeek native
- [x] stepCountIs reduced 40→20 + prompt rules: no vite.config patchFile, no self-check reads
- [x] OPENROUTER_API_KEY in .env.local

### Bug hardening (production fixes) ✅
- [x] `get-contents.ts`: push null on rejection — prevents generator deadlock on API errors
- [x] `route.ts`: fallback triggers on ANY primary error (not just 429) — no more silent failures
- [x] `generate-files.ts`: tool result returns paths only (not content) — ~50k token waste eliminated per generation
- [x] `errors/route.ts`: `generateText` wrapped in try/catch — no more unhandled 500s
- [x] CF gateway removed — DeepSeek called directly (native KV caching at API layer, no proxy needed)
- [x] Empty message bubbles fixed (MessagePart guard: skip parts where `!part.text.trim()`)
- [x] `patchFile` Vite protection: `ensureViteAllowedHosts()` re-applied after any vite config write

---

## PHASE 1.6 — Speed Optimizations ✅ COMPLETE (2026-06-06)

Research-backed speed improvements reducing total generation time ~35-50s:

### #1 — DeepSeek KV prompt caching ✅
- [x] Reordered systemPrompt: base prompt → skill pack (stable) → brief (dynamic last)
- [x] Removes ~2s cache miss penalty on steps 2-20 of the agentic loop

### #2 — Sandbox pre-warming (parallel with expandPrompt) ✅
- [x] `route.ts`: `Promise.all([expandPrompt(...), Sandbox.create(...)])` — expander + sandbox creation run simultaneously
- [x] `create-sandbox.ts`: accepts `prewarmSandboxId` — uses pre-warmed sandbox, falls back to fresh creation
- [x] `tools/index.ts`: `prewarmSandboxId` threaded through Params → createSandbox
- [x] Net savings: ~6-8s on "Initializing Codemine" wait

### #3 — Intent classifier overhaul ✅
- [x] `classifier.ts`: explicit intent taxonomy (Build / Vague / Not-a-build)
- [x] Greetings, chitchat, questions all handled — never starts building from "hey"

### #4 — Prompt cache ordering ✅ (same as #1)

### #5 — Base project scaffold ✅
- [x] `ai/tools/scaffold.ts`: 8 pre-written files (package.json, vite.config.ts, tailwind, tsconfig ×3, postcss, .npmrc)
- [x] `create-sandbox.ts`: writes scaffold to sandbox after creation (before AI generates files)
- [x] `prompt.md`: scaffold section tells AI not to regenerate these 8 files

### #6 — Parallel tool calls ✅
- [x] `prompt.md` WORKFLOW step 2: explicit instruction to emit createSandbox + getUnsplashBatch in same response (parallel)

### #7 — pnpm offline cache / background install ✅
- [x] `create-sandbox.ts`: starts `pnpm install` as detached background process immediately after scaffold write
- [x] `.npmrc` scaffold includes `prefer-offline=true, shamefully-hoist=true`
- [x] By the time AI calls `pnpm install`, background install is 70-100% done → pnpm install step goes from ~60s → ~5-15s

### #8 — getUnsplashBatch parallel image fetching ✅
- [x] `ai/tools/get-unsplash-batch.ts`: all images fetch in parallel via `Promise.all` (was sequential)
- [x] Tools index + prompt updated

### #9 — Two-pass generation (planProject tool) ✅
- [x] `ai/tools/plan-project.ts`: AI commits to complete file list + extra packages before writing code
- [x] `prompt.md` WORKFLOW: planProject called between getUnsplashBatch and generateFiles
- [x] Forces AI to think through full architecture before coding → fewer missing-import errors

---

## PHASE 1.7 — UX + Edit Speed ✅ COMPLETE (2026-06-07)

- [x] Remove "What's this?" button from header (`app/header.tsx`)
- [x] Remove sandbox prewarm entirely — was root cause of 4-min infinite hangs (`route.ts`, `create-sandbox.ts`, `tools/index.ts`)
- [x] Context-aware thinking statements:
  - `components/chat/message-part/text.tsx` — SparklesIcon + prose styling (removed monospace code block)
  - `components/chat/message-part/run-command.tsx` — contextual labels per command (Installing dependencies / Starting preview server / Applying configuration / etc.)
  - `components/chat/message-part/generate-files.tsx` — "Writing code..." during generation, "Built N files" when done
- [x] File generation animation fix (`ai/tools/generate-files.ts`) — passes accumulated uploaded paths so UI shows growing list (file1 ✓ → file1 ✓, file2 ✓ → file1 ✓, file2 ✓, file3 ⟳)
- [x] patchFile-first edit rules (`app/api/chat/prompt.md`) — explicit threshold (~30 lines), concrete examples, no pnpm dev restart after patches
- [x] `gateway.ts` — `include_reasoning: false` fetch wrapper for all OpenRouter calls; disables thinking tokens on Kimi/o1/etc.
- [x] Tested Kimi K2.6 — 7min generation, too slow; confirmed DeepSeek V4 Pro is the right orchestration model
- [x] `OPENROUTER_PRO_MODEL=deepseek/deepseek-v4-pro` in `.env.local`

---

## PHASE 1.8 — Template System ✅ COMPLETE (2026-06-07)

### Architecture implemented
- `ai/templates/types.ts` — TemplateFile + Template types
- `ai/templates/detect.ts` — pure regex template routing (~0ms, no LLM)
- `ai/templates/game-snake.ts` — complete Canvas Snake game (grid, particles, audio, ghost, pause)
- `ai/templates/game-tetris.ts` — complete Tetris (7 pieces, ghost piece, line clear anim, levels)
- `ai/templates/game-flappy.ts` — complete Flappy Bird (physics, parallax clouds, pipes)
- `ai/templates/game-pong.ts` — complete Pong (2-player + AI, ball physics, glow trail)
- `ai/templates/website-saas.ts` — premium dark SaaS landing (glassmorphism, Space Grotesk, gradient orbs)
- `ai/templates/website-restaurant.ts` — editorial dark restaurant (Playfair Display, warm amber, menu sections)
- `ai/templates/index.ts` — registry + getTemplate + getTemplateFiles helpers

### Pipeline wiring done
- [x] `ai/classifier.ts` — returns `templateId` (detectTemplate runs after skill detected)
- [x] `app/api/chat/route.ts` — threads `templateId` → tools; injects scaffold note in system prompt
- [x] `ai/tools/index.ts` — accepts `templateId`, passes to createSandbox
- [x] `ai/tools/create-sandbox.ts` — writes template scaffold + default personality file before pnpm install
- [x] `app/api/chat/prompt.md` — NEVER say "template" or "scaffold" to users

### UX improvement
- [x] `components/preview/preview.tsx` — address bar shows `live.codemineapp.com` (white-labeled); iframe loads real Vercel URL

### Quality
- [x] TypeScript: zero errors
- Games: full game loop, mobile touch, Web Audio, localStorage high score, particle effects
- Websites: immersive dark premium design, editorial typography, glassmorphism/gradient orbs

### Remaining templates to add (future phases)
- [ ] game-pacman (canvas pathfinding, ghost AI)
- [ ] game-space-shooter (canvas, bullets, wave spawning)
- [ ] game-memory (card flip, match detection)
- [ ] game-wordle (word list, keyboard input, color feedback)
- [ ] website-agency (motion/parallax, bold typography)
- [ ] website-portfolio (split layout, project showcases)
- [ ] website-fitness (dark energetic, program sections)
- [ ] webapp-todo (drag-and-drop, tags, filters)
- [ ] webapp-kanban (board columns, card DnD)
- [ ] webapp-chat (message bubbles, online status)

---

## PHASE 2 — Cloudflare Pages Deployment [ ]

- [ ] lib/cloudflare.ts
  - [ ] createPagesProject(projectId) — new CF Pages project per platform project
  - [ ] deployPages(projectId, files) — upload build output, return URL
  - [ ] redeployPages(projectId, files) — update same project (used on edits)
- [ ] URL proxy: yourplatform.app/p/{id} → CF Pages URL (user never sees cloudflare)
- [ ] Auto-deploy after generation completes
- [ ] Show live URL in chat: "Your [website/app/game] is live → [url]" with copy button
- [ ] Re-deploy on edit saves
- [ ] For React+Vite: runCommand(pnpm build) → upload dist/
- [ ] For HTML sites: upload directly (no build step)
- [ ] For games: upload directly (single HTML)
- [ ] Test end-to-end: generate → sandbox → build → CF deploy → URL loads

---

## PHASE 3 — Edit Mode + Chat UX + Error Handling [ ]

### 3a. Two-Panel UI Polish
- [ ] Right panel Live Preview / Code toggle working cleanly
- [ ] Code view shows file explorer + syntax highlighted code (read-only)
- [ ] Mobile preview toggle (shrink iframe to 375px centered)
- [ ] Progress bar during generation (0→100% over estimated time)
- [ ] Generation step labels in chat ("Planning...", "Building UI...", "Installing...", "Deploying...")

### 3b. Edit Mode
- [ ] Post-generation chat input stays active — uses DeepSeek Flash not Pro
- [ ] AI uses readFile → patchFile for small changes (never regenerates whole project)
- [ ] Re-deploys to same CF Pages project after edits
- [ ] Sandbox idle timeout: 30 min, resume shows "Resuming your project..."

### 3c. Error Handling UX
- [ ] Friendly "Overcoming a hurdle..." popup — never raw error text to user
- [ ] Full error + logs sent silently to AI in background
- [ ] AI responds in plain English: "Fixing a small issue with the navigation..."
- [ ] Chat send button disabled while AI is working (already correct via status check)
- [ ] Max 3 retries per error
- [ ] After 3 failures: "Hit a snag — please try describing your project again" + Report button
- [ ] Raw errors to console only

### 3d. Auto Preview Error Detection (self-healing)
Extend auto-fix to catch visual/runtime errors in the generated app itself,
not just server stderr. Currently the ErrorMonitor catches build errors; this
catches runtime JS errors inside the preview iframe.

- [ ] Inject `window.onerror` + `window.addEventListener('unhandledrejection')` handler
      into every generated app's `main.tsx` that POSTs errors to `/api/preview-error`
- [ ] Create `app/api/preview-error/route.ts` — receives error payload, forwards to
      AI via the same sendMessage path as ErrorMonitor
- [ ] AI receives the runtime error and auto-fixes the specific file, same as build errors
- [ ] "Overcoming a hurdle..." shown to user; no raw error ever visible
- [ ] Rate limit: max 3 auto-fixes per session to prevent infinite loops

---

## PHASE 4 — Dashboard [ ]

- [ ] /dashboard route + page
- [ ] lib/localStorage.ts — typed helpers: getProjects(), saveProject(), deleteProject(), getProject()
- [ ] Project schema: { id, name, skill, cfPagesUrl, screenshotBase64, createdAt, sandboxId }
- [ ] Project cards: name (first 5 words of prompt), skill badge, live URL, date, "Open in editor"
- [ ] Max 10 projects limit — "Delete one to create a new one"
- [ ] "Open in editor" → resume sandbox → load context → chat ready
- [ ] Empty state: "You haven't built anything yet. Start with a prompt."
- [ ] Screenshot capture on generation complete (for card thumbnail)

---

## PHASE 5 — Polish [ ]

- [ ] Copy live URL button
- [ ] "New Project" button in nav
- [ ] Favicon + page title + meta description for VibePlatform itself
- [ ] 404 page
- [ ] Landing page (home) explaining what platform does
- [ ] "Report Issue" button on failed generations
- [ ] Rate limit: 10 projects per browser (localStorage count)

---

## PHASE 6 — Auth + Supabase (DO NOT START YET) [ ]

> Only begin once Phase 1-5 are stable and tested in production.

- [ ] Supabase Auth (email/Google)
- [ ] Projects table with user_id foreign key
- [ ] Migrate localStorage on first login
- [ ] Per-user project count
- [ ] Stripe for paid tier (credits system)
- [ ] Upgrade to Vercel Pro + AI Gateway

---

## Reference Links

- Repo: github.com/Codemine-Codey/vibeplatform
- OSS source: github.com/vercel/examples/tree/main/apps/vibe-coding-platform
- Competitor prompts: github.com/dontriskit/awesome-ai-system-prompts
- Vercel Sandbox SDK: vercel.com/docs/sandbox
- DeepSeek API: api-docs.deepseek.com
- CF Pages Direct Upload: developers.cloudflare.com/pages/platform/direct-upload/
- Unsplash API: unsplash.com/developers
