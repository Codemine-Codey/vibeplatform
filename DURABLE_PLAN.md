# Codemine — Full Durable Runs (Fable-designed) — the completion + walk-away + isolation guarantee

> One architecture (runId run-log + server-chained phase invocations) solves FOUR problems at once:
> 800s-cap-immunity, walk-away, concurrency-isolation, and correct per-run token attribution.
> Product bar: **first WORKING preview < ~5 min ALWAYS**, then the build enriches phase-by-phase LIVE
> in the preview (a site assembling itself). "Under 13 min" is not a stopwatch promise on an unbounded
> prompt — progressive delivery is the win. NO user-facing wall/cap (abuse cap dropped per user).

## 1. Phase boundaries — manifest-driven, SHELL-FIRST, replace-not-append
- **Phase 1 (working skeleton, <~4 min):** index.css (full tokens) + Nav + Footer + App.tsx with ALL routes wired + home hero fully built + **branded shell pages for every other route** (real layout + brief's section headings, on-brand — NOT gray boxes). This phase is a complete, deployable site.
- **Phases 2..N (enrichment):** each REPLACES 3–6 shells with full pages/sections (~1 model call, 6–10 files, 90–180s).
- **Final phase:** imagery, motion, full gate suite.
- **Invariant (makes every phase independently renderable):** no file in phase N imports anything from phase N+1 — everything exists as a shell from phase 1, so imports always resolve + the app builds after EVERY phase, by construction. `planProject` emits a `phase` per manifest entry + a validation pass enforces the invariant mechanically.
- Each phase = a transaction: write files → per-file gates + closure (P1-A, built) → `vite build` → **snapshot**. Lands renderable or is repaired/rolled back within its own budget.

## 2. Cross-invocation continuation — run-log as truth, SERVER-chained
- **`runs` table:** id, user_id, project_id, status, phase_cursor, manifest jsonb, brief jsonb, sandbox_id, snapshot_path, tokens_used.
- **`run_events` table:** run_id, seq bigserial, type, payload jsonb. EVERY writer event dual-writes here. This log is CANONICAL; the SSE stream is just a view.
- **Invocation 1** (`POST /api/chat`, unchanged entry): create run, stream live as today, dual-write log, run phases until done OR deadline.
- **Continuation is SERVER-chained (NOT client):** on invocation end with phases pending → `fetch(POST /api/runs/continue {runId})` (secret-authed) inside `waitUntil` — fire-and-forget self-invocation. This is what makes walk-away native (chain ignores whether a client is connected). Client re-invoke fails exactly when needed (phone locked) — reject it.
- **Client reconnect:** `GET /api/runs/:id/stream` — SSE replays run_events from client's last `seq`, then live-tails (1s DB poll ok). Client switches to it on stream end/drop (same pattern as ProjectLoader, one level down).
- **Sweeper:** 1/min Vercel cron claims runs stuck in `continuing` + re-fires. Chain + sweeper = no orphaned runs ever.

## 3. 12-min checkpoint — between phases + hard abort inside
- `deadline = invocationStart + (800s − 90s margin)`.
- **Boundary check (primary):** before phase N, if `remaining < phaseEstimate` → snapshot, set phase_cursor, status `continuing`, chain next invocation, end. Phases ≤ ~3 min so boundary checks almost always suffice.
- **Hard guard inside a phase:** model call carries an AbortSignal wired to the deadline; on trip → salvage files whose CMEND landed (fence protocol makes partials safely discardable), snapshot, chain.
- **Seamless:** server-chained + client tailing the log = ONE continuous event flow; no visible stop/resume.
- **Resume needs ZERO model context:** each phase is a self-contained call (brief + manifest + this phase's files + read-back of key existing files) — getContents already works per-call.

## 4. Progressive preview — the centerpiece
Start dev server + emit preview URL AFTER phase 1. Vite HMR → every later phase's writeFiles updates the iframe LIVE (shells become real pages). Per-phase gates preserve never-show-broken at every increment (a failing phase is repaired/rolled back before its files land; preview stays on last good state). Turns the long-build liability into the platform's best visual.

## Answers to open questions (2026-07)
- **<5 min first preview:** YES — phase 1 is a subset (skeleton), + warm pool ON (−70s) + concurrent install. (Full simple site is 6.4 min today; phase-1 skeleton is faster.)
- **10–13 min = FULL working app**, not a prototype (skeleton is temporary; enrichment fills every section).
- **Warm pool:** currently OFF; turn WARM_POOL=true in Vercel env for the speed target + launch.
- **"Wall":** = Vercel's 800s hard function cap (a hosting limit we didn't choose); durable chaining makes it invisible to the user. No user-facing cap.

## Build order (each independently testable) — DO NOT run the complex deep test until step 4 done
1. **Run rows + dual-write log + reconnect stream** (runs, run_events, log-writer wrapper, GET /api/runs/:id/stream). Isolation + walk-away reading land; ZERO pipeline change.
2. **Phased planning + per-phase gates + progressive preview** (planner emits phases; phase loop inside the existing invocation; preview after phase 1).
3. **Chaining + checkpoint + sweeper** (internal /api/runs/continue, deadline logic, cron). The cap is structurally dead.
4. **Per-run metrics** (run row = reliability-metrics source for the proof run). [Abuse cap: dropped per user.]

Then: run the complex deep test → per-type proof numbers → the guarantee: **preview <5 min always, typical completion <13, no build dies mid-flight, no user sees another's build** — enforced by structure, measured by the proof.
