# VibePlatform — Build Tasks

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
- [ ] Set up Cloudflare AI Gateway (free, no Pro plan needed) — see CLAUDE.md for steps
- [ ] Get Unsplash API key (free tier, 50 req/hr) — needed for Phase 1
- [ ] Get Cloudflare API token (Pages:Edit permission) — needed for Phase 2
- [ ] Deploy to Vercel production (vercel --prod) — do after Phase 1 is stable

> AI Gateway: Use Cloudflare AI Gateway (free). Set AI_GATEWAY_BASE_URL env var — zero code changes needed.
> OIDC token expires — re-run `vercel env pull .env.local --yes` then re-add DEEPSEEK_API_KEY after pulling if sandbox auth fails.

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
