# Codemine Reliability Plan — "No user ever sees a broken build"

> Goal: move from ~1/1 builds having errors → industry-grade reliability, **proven by a measured pass
> rate across many real builds**, ending in a guarantee enforced by a gate (not by claims).
> Owner of the number: the user. Owner of the work: the assistant.

## The core principle (why past attempts failed)
Adding a rule per failure ("use lucide-react") never converges — free-form full-app generation has an
unbounded failure surface. Reliability comes from TWO structural things, not more rules:
1. **Generate less from scratch** (constrain the model — more scaffold, known-good patterns).
2. **A gate that RUNS the app and refuses to show anything broken** (block or auto-fix; never display
   a blank/error/hung preview).

Everything below serves those two.

---

## Metrics (the only things that count — measured, not claimed)
- **CLEAN-FIRST-RATE**: % of builds that render with zero errors on the first try.
- **AUTO-FIX-RATE**: % of the rest fixed automatically within 90s (deterministic, not slow AI loops).
- **BROKEN-SHOWN**: builds where a user saw a blank/error/hung preview. **Target: 0. Non-negotiable.**
- **TIME-TO-CLEAN**: median minutes from prompt → clean preview.

**LAUNCH BAR:** CLEAN-FIRST ≥ 85%, (CLEAN-FIRST + AUTO-FIX) ≥ 97%, BROKEN-SHOWN = 0, TIME-TO-CLEAN ≤ 9 min.
Do not launch until this is hit across the Phase-4 batch. The user sees the numbers.

**ALL TYPES — the bar is met PER TYPE, not just in aggregate.** The proof batch is balanced across
**websites, web apps, AND games** (and varied styles within each), and the metrics are reported
**broken out per type.** A 97% aggregate that is 100% websites + 60% games does NOT pass — every type
must independently clear the bar. Type-specific runtime checks layer on the universal gate: games get
the canvas-motion smoke test (does it actually animate + respond to input, not turtle-slow); web apps
get an interaction/console-error check; websites get the per-route meaningful-paint check.
NOTE: "renders clean, zero errors" is guaranteed for every type. Deep behavioural correctness (a
subtle scoring bug, a wrong total) is a HARDER, separate bar — improved by type gates + reference
lookups, but not claimed as identical to "zero errors." We are honest about which is which.

---

## Phase 0 — Baseline truth (know where we really stand)  [assistant runs]
Run **25 diverse builds** (websites, web apps, games — varied styles + the exact failing "premium
fine-dine sushi" prompt). For each: capture whether it rendered clean, and EVERY failure with its
category. Output a **failure catalog** (ranked by frequency) + the honest starting numbers.
**Exit:** a table of real numbers + a ranked list of the top failure modes. No fixing yet — just truth.

## Phase 1 — The safety net: real runtime-render gate  [assistant builds]  ← highest leverage
Boot every finished build in a headless browser and BLOCK on:
- console errors / uncaught exceptions,
- blank/near-empty render (root has no meaningful content),
- the specific classes we keep hitting (empty/placeholder components, undefined CSS classes used in JSX,
  missing imports/files, truncated files).
If any fire → **targeted repair of only the offending file → re-check → loop, hard cap 3 tries →** if
still broken, **do NOT show it**: fall back to the last clean state or a graceful "still polishing" with
auto-retry. **Never a blank/error/spinner-forever preview.**
**Exit:** BROKEN-SHOWN = 0 on the Phase-0 set (even where the build itself is imperfect, the user never
sees breakage).

## Phase 2 — Kill the top failure modes deterministically  [assistant builds]
From Phase 0's catalog, for each recurring failure add a **deterministic catch** that runs in seconds
(examples, real ones we've already seen):
- placeholder icon components → auto-swap to lucide-react,
- CSS class used in JSX but never defined → inject a sane definition or flag+regen,
- import with no matching file → generate the missing file or fix the path,
- truncated/short file → auto-continue that file specifically.
**Exit:** each cataloged failure mode has a deterministic catch; AUTO-FIX-RATE climbs, TIME-TO-CLEAN drops.

## Phase 3 — Shrink the failure surface (constrain generation)  [assistant builds]
Where the model repeatedly free-writes and fails, replace free-writing with scaffold / known-good
patterns so it fills gaps instead of inventing architecture. Tighten the generation prompt with the
actual failing examples as counter-examples.
**Exit:** CLEAN-FIRST-RATE rises meaningfully vs Phase 0.

## Phase 4 — Prove it (the measured guarantee)  [assistant runs, user reviews]
Run **50–100 diverse builds**. Publish the four metrics. Iterate Phases 1–3 on whatever still fails.
Repeat until the **LAUNCH BAR** is met and stable across the full batch.
**Exit = the guarantee below, backed by the batch numbers.**

---

## The guarantee (what "done" means — enforced, not promised)
1. **BROKEN-SHOWN = 0** — a user never sees a blank/error/hung preview; the runtime gate structurally
   blocks it (worst case = graceful retry). This is enforced by code, so it holds for build #1 and
   build #1,000,000.
2. **(CLEAN-FIRST + AUTO-FIX) ≥ 97%** across the Phase-4 batch, measured, visible to the user.
3. **No infinite hangs** — every build resolves (clean or graceful) within a hard time budget.
4. **Your exact sushi prompt** (and every Phase-0 prompt) builds clean, no manual fixes — shown as proof.

## How the user stays in control
After Phase 0 and Phase 4, the user sees the real numbers. **Launch is the user's call, gated on the
numbers — not on any assistant claim.** If the bar isn't met, we don't launch; we iterate.

## Status log
- [ ] Phase 0 — baseline 25 builds + failure catalog
- [ ] Phase 1 — runtime-render gate (BROKEN-SHOWN → 0)
- [ ] Phase 2 — deterministic catches for top failures
- [ ] Phase 3 — constrain generation
- [ ] Phase 4 — 50–100 build proof run → LAUNCH BAR met

---

# EXECUTION SPEC (expert-reviewed, structural — supersedes the phase framing above where they differ)

**Core reframe:** the failure surface is finite. Every observed failure violates ONE of five
statically-checkable **artifact closure contracts**. Don't add prompt rules the model ignores — add
**acceptance contracts**: an artifact that violates a contract is never shown. Fix priority is always
**mechanical transform (<1s) → targeted AI regen (30–90s) → deterministic template fallback (renders)**.
Gates run **incrementally while files stream**, not at the end (that's where the 12→9 min lives).

The five contracts: (1) every JSX identifier resolves to a NON-EMPTY impl; (2) every className exists
(Tailwind ∪ generated CSS); (3) every file parses + every manifest entry exists; (4) every route
produces a meaningful paint; (5) every loop has a budget + terminal state.

## P0-A — Stream integrity + manifest auto-continue (kills truncation + the manual "continue")
Files: `ai/tools/generate-files/get-contents.ts`, `app/api/chat/route.ts` (pipeline), planProject manifest.
- Per-file on arrival: require the `<<<CMEND>>>` fence + a fast parse (brace/JSX balance or ms babel). Fail → re-request THAT file only while the stream continues.
- At stream end: diff received files vs the planProject manifest → auto-issue the continuation **inside the same pipeline run**. The user's "Please continue…" click must cease to exist.

## P0-B — Bounded repair state machine (kills the 2:00-forever hang)
Files: repair/verify section of `app/api/chat/route.ts` (verifyAndRepair / headlessRuntimeCheck), client watchdog in `app/chat.tsx` / error-monitor.
- Budgets: total repair ≤150s, ≤2 AI attempts/file, ≤3 files/build; AbortSignal on every AI call.
- Terminal states (always reached, always emit): `clean`→show · `renders + cosmetic flags`→ship, background-fix · `not renderable + budget out`→ swap offending page for a deterministic brief-token template (renders), background-fix. **No fourth state.**
- Client watchdog: no stream event for N s → resume affordance, never a frozen timer.

## P1-A — Static semantic gate (NEW module — catches the sushi class in <5s, no browser, no AI)
File: NEW `ai/gates/semantic-gate.ts`, wired into the pipeline before/while writing to sandbox; fold in existing export/import-closure.
- Identifier closure + empty-render detection (component returns null/empty frag/childless span → flag).
- **Mechanical icon fix:** `*Icon` with empty local def → delete def, add `import { Fish as FishIcon } from 'lucide-react'` (strip `Icon`, match lucide export, fallback `Sparkles`). Zero AI.
- **CSS closure:** classNames vs Tailwind namespace ∪ generated CSS; unknown custom class → **synthesize** from brief palette (e.g. `gold-gradient-text` → linear-gradient + bg-clip:text), flag-for-regen second.

## P1-B — Runtime gate hardening (last line: never show broken)
File: `headlessRuntimeCheck` in `app/api/chat/route.ts`.
- Per-route meaningful paint: walk `/`,`/menu`,… require root innerHTML floor + sane element count + zero uncaught console errors + screenshot pixel-variance. Any fail → back to P0-B state machine, never the user.

## P2-A — Shrink the surface
Files: `ai/tools/scaffold.ts` (+ prompt). Ship `index.css` with the ~10 utilities models keep inventing (gradient-text, glass, section rhythm), token-driven; tell the model they exist. Icon policy enforced by P1-A rewrite, not prompt.

## P2-B — Latency (12→9 min)
Incremental P1-A during stream (≈0 added) · deterministic fixes replace AI repair calls (−30–90s each) · `bun install` at package.json write (concurrent) · warm pool ON at launch (−70s) · visual-quality AI check non-blocking/advisory.

## Build order
P0-A + P0-B (end the two user-visible catastrophes) → P1-A (biggest error-class kill/hour) → P1-B → P2.
Each step proven per the metrics above; launch gates on the Phase-4 number.
