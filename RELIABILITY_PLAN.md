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
