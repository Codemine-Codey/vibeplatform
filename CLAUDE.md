# VibePlatform — Vibe Coding Platform

> Repo: github.com/Codemine-Codey/vibeplatform (branch: master)
> Local: C:\Users\shazi\OneDrive\Desktop\VibePlatform
> Stack forked from vercel/examples/apps/vibe-coding-platform

---

## Current Build Status (as of 2026-06-05)

**Phase 0 is complete.** DeepSeek v4 Pro is connected and generating. Sandbox spins up, files generate, dev server runs, preview URL is returned. Core pipeline is working.

**Phase 1 is next.** Three-skill system (website / webapp / game), intent classifier, Unsplash tool, project context memory, and system prompt quality pass.

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Platform host | Vercel (Next.js 16, App Router, Turbopack) | |
| AI — orchestration | DeepSeek v4 Pro | Direct API, `.chat()` forces Chat Completions |
| AI — file generation | DeepSeek v4 Flash | Used in `get-contents.ts` nested call |
| AI — error analysis | DeepSeek v4 Flash | Used in `errors/route.ts` |
| AI SDK | Vercel AI SDK v6 (`ai@6.0.105`) | `@ai-sdk/openai@3.0.37` |
| Sandboxes | Vercel Sandbox (Firecracker microVMs) | One per project, VERCEL_OIDC_TOKEN auth |
| User app deploy | Cloudflare Pages API | Phase 2 — not yet implemented |
| Images | Unsplash Source API | Phase 1 — not yet implemented |
| Storage | Browser localStorage (Phase 1) → Supabase (Phase 2) | |
| CSS | Tailwind CSS only | |
| Icons | Lucide React only | No SVG anywhere |

---

## Critical Technical Decisions (resolved during Phase 0)

### DeepSeek API Compatibility
The `@ai-sdk/openai@3.0.37` defaults to OpenAI's Responses API (`/v1/responses`). DeepSeek only supports Chat Completions (`/v1/chat/completions`). Fix: use `provider.chat(modelId)` in `getModelOptions()` — this forces the Chat Completions endpoint.

### Output.object() Incompatibility
The OSS used `Output.object()` with `streamText` for structured output (file generation + error analysis). This requires the Responses API, which DeepSeek doesn't support. Fix: rewrote both to use tool-call based structured output (DeepSeek natively supports tool calling).

### React Maximum Update Depth
DeepSeek streams much faster than the AI Gateway-buffered Claude. The `onData` callback in `chat-context.tsx` called Zustand store setters synchronously while React was mid-render, causing nested setState calls. Fix: `setTimeout(() => mapDataToStateRef.current(data), 0)` in `onData` — defers each event to the next event loop tick.

### File Generation Batching
Original `get-contents.ts` used streaming partial objects and yielded one file at a time. This caused rapid-fire `writer.write()` calls flooding React state. Fix: collect all files via tool calls, yield ONE batch at the end.

### AI Gateway
Vercel AI Gateway requires Pro plan. We use direct DeepSeek API with `provider.chat()`. At launch, set `AI_GATEWAY_BASE_URL` env var — zero code changes needed, the `??` fallback in `gateway.ts` handles it automatically.

---

## Project Structure

```
/
├── ai/
│   ├── constants.ts          DEFAULT_MODEL='deepseek-v4-pro', FILE_GENERATION_MODEL='deepseek-v4-flash'
│   ├── gateway.ts            createOpenAI → provider.chat() forces Chat Completions
│   ├── tools/
│   │   ├── create-sandbox.ts  OSS (unchanged)
│   │   ├── generate-files.ts  OSS (unchanged)
│   │   ├── run-command.ts     OSS (unchanged)
│   │   ├── get-sandbox-url.ts OSS (unchanged)
│   │   └── generate-files/
│   │       ├── get-contents.ts  REWRITTEN — generateText + tool calls (not Output.object)
│   │       └── get-write-files.ts OSS (unchanged)
├── app/
│   ├── api/
│   │   ├── chat/
│   │   │   ├── route.ts      maxDuration=300, stepCountIs(25), no messageMetadata spam
│   │   │   └── prompt.md     FULL REWRITE — VibePlatform identity + design rules
│   │   ├── errors/
│   │   │   └── route.ts      REWRITTEN — tool-call based (not Output.object)
│   │   └── models/route.tsx  Returns single model entry
│   ├── chat.tsx              Removed model selector + model/reasoning from sendMessage body
│   ├── header.tsx            VibePlatform branding, ZapIcon, no Vercel logo
│   └── page.tsx              Panel layout 34/33/33 (was 33.33x3=99.99 warning)
├── components/
│   ├── settings/
│   │   ├── use-settings.ts   Simplified — fixErrors only, no modelId/reasoningEffort
│   │   ├── model-selector.tsx Returns null (hidden from users)
│   │   └── reasoning-effort.tsx Returns null (GPT-specific feature removed)
│   ├── modals/welcome.tsx    VibePlatform copy, no Vercel/Claude/GPT mentions
│   └── banner.tsx            VibePlatform Beta copy
└── lib/
    └── chat-context.tsx      onData uses setTimeout(fn,0) to prevent React update depth error
```

---

## AI Generation Rules — NON-NEGOTIABLE

### Code Quality (Priority #1 — We use Pro model for a reason)
- Generate **production-quality code on the first attempt** — no placeholders, no stubs, no TODO comments
- Every import must have a corresponding file generated in the SAME generateFiles call
- Never split file generation into multiple calls (pages first, components second) — ALL files in ONE call
- Every feature visible in the UI must be functional — no disabled buttons, no "coming soon"
- Code must compile and run without errors on the first `pnpm dev`
- Use TypeScript properly — no `any`, no type assertions unless genuinely necessary

### Visual / Design
- NEVER use SVG — not inline SVGs, not `<svg>` tags, not SVG files. Use Lucide React exclusively
- NEVER use placeholder greys, dummy boxes, or empty image containers
- NEVER use generic cookie-cutter layouts — design deliberately for the brand context
- NEVER use Lorem ipsum or placeholder text — write real contextual copy
- ALWAYS use Unsplash images for every visual section (Phase 1 — tool available)
- Derive color palettes from brand context — never default blue/grey

### Error UX (user never sees technical errors)
- Never show raw error messages, file paths, or stack traces to the user
- Tell the user in plain language: "Fixing a small issue with [component]..." — nothing technical
- Work silently in background when fixing errors
- After fixing: "Got it working — here is your preview."

### File Generation Rules
- Plan ALL files before calling generateFiles — list every file, every component, every config
- All files referenced by imports MUST exist in the same generateFiles call
- Never call generateFiles twice for the same project (initial) — one call, all files
- For edits: only generate the specific changed file, never the whole project

---

## Skill Types

### Website (detected from: "website for X", "landing page", "portfolio", "agency site")
- Minimum 6-7 distinct sections with unique visual identities
- Required: Hero (full viewport, Unsplash image), about/story, services/menu/features, visual impact (gallery/stats/testimonials), CTA, footer
- Minimum 2 sub-pages where contextually appropriate
- Scroll animations via Intersection Observer, mobile responsive, contact form

### Web App (detected from: "todo app", "dashboard", "chatbot", "calculator", "tracker")
- 100% functional core loop — no stubs
- Multiple views/routes, React state management, localStorage persistence
- Empty states, loading states, error states all handled

### Web Game (detected from: "game", "flappy bird", "snake", "tetris", "platformer")
- Complete loop: start screen → gameplay → game over → score → play again
- Keyboard + touch controls, localStorage high score
- Simple games: pure HTML5 Canvas. Complex games: Phaser.js via CDN
- Web Audio API sound (even basic oscillator tones)

---

## UI Layout

```
┌─────────────────────────────────────────────────────┐
│  ⚡ VibePlatform          [settings]  [what's this?] │
├──────────────────────┬──────────────────────────────┤
│  CHAT PANEL          │  Preview / Code (toggle)     │
│                      │                              │
│  [AI messages]       │  <iframe sandbox preview />  │
│  [tool activity]     │  OR                          │
│                      │  <FileExplorer + CodeView />  │
│  [text input] [send] │  [mobile preview toggle]     │
└──────────────────────┴──────────────────────────────┘
```

- Chat input disabled while AI is working (status !== 'ready')
- Errors shown as friendly "Overcoming a hurdle..." notification, never raw
- AI speaks plain English about what it's fixing

---

## Sandbox Behavior
- One Firecracker microVM per project session (named by session ID)
- Zero leakage between projects — kernel-level isolation
- Idle timeout: 30 min → paused (filesystem snapshotted)
- Resume: `Sandbox.get({ sandboxId })` restores exact state
- Auth: VERCEL_OIDC_TOKEN (via `vercel env pull` locally, auto-injected on Vercel)

---

## Environment Variables

```bash
# Required now (local dev)
DEEPSEEK_API_KEY=sk-572709e50fb64ea098717ec5e6d25d22
VERCEL_OIDC_TOKEN=<from vercel env pull>

# Required for Phase 2 (Cloudflare deploy)
CF_ACCOUNT_ID=
CF_API_TOKEN=                 # needs Pages:Edit permission

# Required for Phase 1 (images)
UNSPLASH_ACCESS_KEY=          # free tier, 50 req/hr

# Production only (AI Gateway at launch)
AI_GATEWAY_BASE_URL=          # set in Vercel dashboard, zero code changes needed
```

---

## Known Patterns & Gotchas

- `provider.chat(modelId)` NOT `provider(modelId)` — the latter uses Responses API
- `stopWhen: stepCountIs(N)` NOT `maxSteps: N` — renamed in AI SDK v6
- `generateText` has no `onError` param in v6 — use try/catch instead
- `Output.object()` requires Responses API — use tool-call pattern instead
- `vercel env pull` overwrites `.env.local` — always re-add DEEPSEEK_API_KEY after pulling
- `VERCEL_OIDC_TOKEN` expires — re-run `vercel env pull` if sandbox auth fails
- Hot reload does NOT reinitialize module-level provider — full server restart needed after gateway.ts changes
- Panel layout must sum to exactly 100 — use 34/33/33 not 33.33x3

---

## Commit Pattern
- After every phase: `git add -A`, commit with author Shazim, push to master
- Author: Shazim <shazim.rv11@gmail.com>
- Co-author line: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
- Do NOT push `.env.local` or `CREDENTIALS.md` (gitignored)
