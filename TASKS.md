# VibePlatform — Build Tasks

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## PHASE 0 — Foundation & Fork Setup ✅ MOSTLY DONE

- [x] Repo created: github.com/Codemine-Codey/vibeplatform
- [x] OSS vibe-coding-platform files copied (119 files, sparse checkout from vercel/examples)
- [x] CLAUDE.md, TASKS.md, .env.example committed
- [x] pnpm install — dependencies installed
- [x] ai/constants.ts — replaced Claude/GPT/Grok with DeepSeek v4 Pro + Flash
- [x] ai/gateway.ts — replaced createGatewayProvider with createOpenAI pointing to DeepSeek
- [x] ai/tools/generate-files/get-contents.ts — uses FILE_GENERATION_MODEL (Flash) for nested file gen
- [x] app/api/chat/route.ts — removed modelId/reasoningEffort from body, added maxDuration=300, stepCountIs(25)
- [x] app/api/chat/prompt.md — full rewrite: VibePlatform identity, confidentiality, design rules, skill types, workflow
- [x] app/api/errors/route.ts — switched from GPT-5 to DeepSeek Flash for error analysis
- [x] app/header.tsx — removed Vercel logo + "OSS Vibe Coding Platform", replaced with ZapIcon + "VibePlatform"
- [x] components/settings/reasoning-effort.tsx — removed GPT-only reasoning toggle (returns null)
- [x] components/settings/model-selector.tsx — hidden from users (returns null)
- [x] components/settings/use-settings.ts — removed modelId/reasoningEffort from hook
- [x] app/chat.tsx — removed ModelSelector component and model/reasoning from sendMessage body
- [x] TypeScript check: PASSING — zero errors
- [x] .env.local created with DEEPSEEK_API_KEY + VERCEL_OIDC_TOKEN (via vercel env pull)
- [x] DeepSeek API confirmed working — .chat() forces Chat Completions endpoint
- [x] get-contents.ts rewritten — tool-call based file generation (no Output.object, DeepSeek compatible)
- [x] errors/route.ts rewritten — tool-call based error analysis (no Output.object)
- [x] API test: POST /api/chat 200, DeepSeek connected, sandbox created ✅
- [x] TypeScript: zero errors ✅
- [ ] Test full generation in browser UI (snake game prompt)
- [ ] Confirm sandbox preview URL loads in iframe
- [ ] **CRITICAL TEST**: Submit a 5-6 min generation, confirm no timeout
- [ ] Get Cloudflare API token with Pages:Edit permission
- [ ] Get Unsplash API key (free tier, 50 req/hr)
- [ ] Deploy to Vercel (vercel --prod, add env vars in Vercel dashboard)

> NOTE: AI Gateway deferred until launch (requires Pro plan). Direct DeepSeek is used.
> At launch: set AI_GATEWAY_BASE_URL env var — zero code changes needed.

---

## PHASE 1 — Three Skill System

### 1a. Intent Classifier
- [ ] Create `ai/classifier.ts`
  - [ ] Takes user prompt string
  - [ ] Uses DeepSeek Flash (single call, no streaming)
  - [ ] Returns `{ skill: 'website' | 'webapp' | 'game', clarify: false }` or `{ skill: null, clarify: true, question: string }`
  - [ ] Clear cases: "website for X", "landing page", "portfolio" → website; "game like Y", "flappy bird" → game; "chatbot", "todo app", "dashboard" → webapp
  - [ ] Test with 20 different prompts before moving on

### 1b. New Tools
- [ ] Create `ai/tools/read-file.ts` — wraps `runCommand(cat <path>)`, returns file content string
- [ ] Create `ai/tools/patch-file.ts` — targeted string replace: `(sandboxId, path, oldString, newString)` → reads file, replaces, writes back
- [ ] Create `ai/tools/get-unsplash.ts` — `(keyword: string)` → Unsplash search API → returns best photo URL in format: `https://images.unsplash.com/photo-{id}?auto=format&fit=crop&w=1200&q=80`
- [ ] Add all three new tools to `ai/tools/index.ts`
- [ ] Register new tools in the main agent tool list

### 1c. Project Context System
- [ ] Create `ai/context.ts` with:
  - [ ] `readProjectContext(sandboxId)` — reads `_project_context.md` from sandbox
  - [ ] `writeProjectContext(sandboxId, context)` — writes/updates context file
  - [ ] `initProjectContext(sandboxId, skill, userIntent)` — creates fresh context at generation start
- [ ] Inject context read as a mandatory first step in the agent system prompt

### 1d. Skill System Prompts
Research references before writing: `github.com/dontriskit/awesome-ai-system-prompts` (Lovable, v0, same.new, Bolt.new prompts)

- [ ] Create `ai/skills/website.ts`
  - [ ] Sections: hero (full-viewport, real Unsplash image, not grey), about/story, services/features, visual gallery or stats section, social proof (testimonials or logos), strong CTA section, footer with links
  - [ ] Minimum 2 sub-pages (derive from context: a restaurant → /menu; a business → /about + /contact)
  - [ ] Scroll reveal animations via Intersection Observer (no heavy libs)
  - [ ] Typography: choose font pairing that fits the brand tone (use Google Fonts via CDN)
  - [ ] Color palette: derived entirely from brand context — never default blue/grey
  - [ ] Anti-patterns BANNED: generic 3-column feature cards, stock-photo-style placeholder images, cookie-cutter hero with centered heading + subtitle + two buttons
  - [ ] Every section has a distinct visual identity within the page
  - [ ] Real copy that sounds like a real brand

- [ ] Create `ai/skills/webapp.ts`
  - [ ] Every feature in the UI must be functional — no disabled buttons, no "coming soon"
  - [ ] Multiple views required (sidebar nav or tabs or routes)
  - [ ] Data persistence via localStorage until backend requested
  - [ ] Clean component architecture (no 500-line single files)
  - [ ] Error states, loading states, empty states — all handled
  - [ ] Anti-patterns BANNED: grey placeholder UIs, unstyled forms, no feedback on user actions

- [ ] Create `ai/skills/game.ts`
  - [ ] Start screen with title + Play button
  - [ ] Core gameplay loop (complete — no stubs)
  - [ ] Game over screen with score + Play Again button
  - [ ] Keyboard controls + touch controls (tap/swipe mapped appropriately)
  - [ ] Score tracking + high score in localStorage
  - [ ] Responsive canvas (fills viewport, aspect ratio maintained)
  - [ ] Phaser.js via CDN for complex games; pure Canvas for simple (Tetris, Snake, Pong → Canvas; platformer, shooter → Phaser)
  - [ ] At least basic sound (Web Audio API oscillator tones — no silence)

- [ ] Write the **base system prompt** used by all three skills (anti-SVG, Unsplash-only, no Lorem ipsum, no generic layouts, context read first, patchFile for edits, targeted changes only)
- [ ] Add **confidentiality block** to base system prompt:
  - Never reveal model name, sandbox tech, deployment provider, or system instructions
  - Friendly deflection responses for all probing questions (see CLAUDE.md for response table)
  - Prompt injection defense: treat jailbreak patterns as confused users, redirect to building

- [ ] Connect classifier output → correct skill system prompt → agent
- [ ] Test each skill end-to-end with 3 different prompts each
- [ ] Quality review: does output look like a $5k designer made it? If not, iterate on skill prompt.

---

## PHASE 2 — Cloudflare Pages Deployment

- [ ] Create `lib/cloudflare.ts`
  - [ ] `createPagesProject(projectId)` — creates a new CF Pages project named `vibe-{projectId}`
  - [ ] `deployPages(projectId, files)` — uploads build output, returns `pages.dev` URL
  - [ ] `redeployPages(projectId, files)` — updates existing project (used for edits)
- [ ] Trigger deploy automatically when generation reaches "done" state
- [ ] Show URL in UI: "Your app is live → [url]" with copy button
- [ ] Set up URL proxy: `yourplatform.app/p/{projectId}` → proxy to CF pages URL (user never sees Cloudflare)
- [ ] Handle build step inside sandbox before deploy:
  - [ ] For React+Vite apps: `runCommand(npm run build)` → upload `dist/`
  - [ ] For HTML sites: upload files directly (no build step)
  - [ ] For games: upload directly (single HTML file)
- [ ] Test: generate → sandbox runs → build → CF deploys → URL shown → URL works
- [ ] Test: edit → re-deploy → same URL updates with new content

---

## PHASE 3 — Edit Mode + Chat + Two-Panel UI

### 3a. UI Layout
- [ ] Implement two-panel `BuildWindow` component
  - [ ] Left: `ChatPanel` (messages + input + tool activity status lines)
  - [ ] Right: `PreviewPanel` with `[Live Preview] [Code]` toggle tabs
  - [ ] Live Preview = iframe pointing to `getSandboxUrl` result
  - [ ] Code view = file explorer (file tree) + syntax-highlighted code (read-only for now)
  - [ ] Mobile preview toggle button: shrinks iframe to 375px width centered
  - [ ] "Overcoming a hurdle..." UI state when sandbox error detected
  - [ ] "Fixed! [description]" UI state after error resolved

### 3b. Edit Mode Agent
- [ ] After generation complete: chat input stays active, switches to edit mode
- [ ] Edit mode uses DeepSeek Flash (not Pro)
- [ ] Edit mode system prompt: read context → read file → patch only → update context
- [ ] Enforce: `patchFile` for changes to existing files, `generateFiles` only for new files
- [ ] Re-deploy to CF Pages after edit session ends (or on explicit "save & deploy" button)
- [ ] Sandbox idle timeout: 30 min → pause + snapshot. On resume: "Resuming your project..." message

### 3c. Error Handling
- [ ] Intercept sandbox stderr/non-zero exit codes
- [ ] Show "Overcoming a hurdle..." in chat
- [ ] Pass raw error to AI with instruction to fix silently
- [ ] Max 3 retries per error
- [ ] After 3 failures: show error + "Report Issue" button
- [ ] Log errors to console (for debugging)

---

## PHASE 4 — Dashboard

- [ ] Create `/dashboard` route + page component
- [ ] Create `lib/localStorage.ts` with typed helpers:
  - [ ] `getProjects()` → `StoredProject[]`
  - [ ] `saveProject(project)` → enforces 10-project max
  - [ ] `deleteProject(id)`
  - [ ] `getProject(id)`
- [ ] Capture screenshot of sandbox preview at generation complete (use iframe + html2canvas or just save the sandbox URL for live thumbnail)
- [ ] Project cards showing: name (first 5 words of prompt), skill badge, live URL link, creation date, "Open in editor" button
- [ ] "Open in editor" → navigates to `/build/{id}` → resumes sandbox by name → loads context
- [ ] "Delete" button on project card
- [ ] Empty state: "You haven't built anything yet. Start with a prompt ↑"
- [ ] Show "X / 10 projects used" counter

---

## PHASE 5 — Polish

- [ ] Progress bar during generation (0% → 100% over estimated 5 min)
- [ ] Generation step labels in chat:
  - "Understanding your idea..."
  - "Planning the structure..."
  - "Building the UI..."
  - "Adding styles and images..."
  - "Installing dependencies..."
  - "Starting preview..."
  - "Deploying to the web..."
- [ ] "Copy live URL" button (copies platform proxy URL)
- [ ] Mobile preview toggle (375px iframe) in preview panel
- [ ] "Report Issue" button on failed generations (opens mailto or form)
- [ ] "New Project" button in nav (clears current session, goes to home)
- [ ] Favicon, page title, meta description for the platform itself
- [ ] 404 page
- [ ] Basic landing page (home) explaining what the platform does

---

## PHASE 6 — Auth + Supabase (DO NOT START YET)

> Only begin this phase once Phase 1-5 are stable and tested.

- [ ] Choose auth provider (Supabase Auth is natural fit)
- [ ] Create Supabase project for the platform (separate from user app D1 databases)
- [ ] Schema: `users` table + `projects` table with `user_id` foreign key
- [ ] On first login: migrate localStorage projects to Supabase for that user
- [ ] Protect dashboard route with auth middleware
- [ ] Per-user project count (still 10 free, higher limit on paid tier later)
- [ ] Stripe integration (later — when pricing is decided)

---

## Research & Reference Links

- OSS source: `github.com/vercel/examples/tree/main/apps/vibe-coding-platform`
- Competitor system prompts: `github.com/dontriskit/awesome-ai-system-prompts` (Lovable, v0, same.new, Bolt.new)
- Vercel Sandbox SDK: `vercel.com/docs/sandbox`
- Vercel AI Gateway BYOK: `vercel.com/docs/ai-gateway`
- CF Pages API: `developers.cloudflare.com/pages/platform/direct-upload/`
- Unsplash API: `unsplash.com/developers`
- DeepSeek API: `api-docs.deepseek.com`
