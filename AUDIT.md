# ═══════════════════════════════════════════════════════════════════════════════
# AUDIT DELTA — 2026-08-29 (reconciled against LIVE evidence, not re-derived)
# ═══════════════════════════════════════════════════════════════════════════════
# Context: user lost ~$3.14 on a build with no preview. Investigated with live prod
# config (/api/version), Vercel env, OpenRouter/Moonshot APIs, and the deploy/alias
# state. This delta CORRECTS several original assumptions and re-verifies "done" claims.

## 🔴 NEW ROOT CAUSES FOUND TODAY (none were in the 08-17 audit)

### D1 — Cost catastrophe was an ENV OVERRIDE, not model/convergence  [was the $3 burn]
`CM_FILE_MODEL=openai/gpt-5.6-terra` was set in prod env 4 days prior (leftover from the
Terra/Luna A/B). Code default was Kimi, but the env override forced GPT-5.6 Terra at ~$15/M
on EVERY build → $3+ builds. Confirmed live: `/api/version` → `"fileModel":"openai/gpt-5.6-terra"`.
The 08-17 audit's "cost = convergence" is TRUE but was NOT today's cause. **Correction to my
own earlier claim this session:** OpenRouter `allow_fallbacks` CANNOT swap Kimi→Terra (it only
picks hosts of the SAME model); the env override was the mechanism. FIX: removed the override;
switched to `kimi-k2.6` via DIRECT Moonshot API. LESSON: env overrides are the silent-drift
vector — always verify `/api/version` live, never theorize.

### D2 — Deploys were INVISIBLE: stable alias pinned to an old deployment  [explains "nothing changes"]
`vibeplatform-rho.vercel.app` (the URL the user tests) does NOT auto-advance. `vercel deploy
--prod` created new deployments but the alias stayed on an OLD one → every deploy for days went
nowhere the user could see; they kept seeing Terra + stale code regardless of what shipped. This
very likely explains MANY past "deploy failing / fix didn't work" sessions. FIX: `vercel alias
set <new-url> vibeplatform-rho.vercel.app` after every deploy (now mandatory; in deploy memory).

### D3 — CM_ORCHESTRATOR="worker\n" — trailing newline broke Trigger.dev selection
Prod env had a literal newline: `"worker\n" !== "worker"`, so `USE_TRIGGER` was false and prod
silently ran Vercel Workflow, not Trigger.dev — despite the user believing they were on Trigger.
Same env-hygiene class as D1. FIX: set cleanly to `vercel` (proven path) until Trigger.dev is
proven E2E, then flip to `worker`. Trigger.dev tasks NOW deployed (v20260829.1).

### D4 — Stale/invalid model ID + kill-cap was a no-op
- `deepseek/deepseek-v4-flash-20260731` is NOT a real OpenRouter ID (verified via models API);
  the valid one is `-0731`. Fixed across DEFAULT/EDIT/ERROR/ORCH/BRIEF/REPAIR.
- The per-generation kill cap read a cost accumulator that stayed 0 → decorative. FIXED: steps
  return `tokenBox.costUsd` directly; `[cm-cost]` diag proves it non-zero; a tripped cap now
  writes a durable plain-words ending (`stepCostKillFail`) instead of a silent blank.

### D5 — Gap A: the 12-min blank's real mechanism
Client reconnect (`reconnectAndDrain`, up to 80 min) EXISTS, but `activeRunId` was set ONLY by
the `data-run` stream event. If the stream dropped before that event → no runId → no reconnect →
dead UI (the exact blank). ALSO the no-restart guards keyed on `activeRunId`, so a null runId
fell through and RE-DROVE a 2nd generation (the $0.86 ≈ 2× doubling). FIXED: (a) capture runId
from `x-workflow-run-id` response header immediately; (b) guards now refuse to re-drive ANY active
build regardless of activeRunId capture — enforced, not optional.

## ✅ RE-VERIFIED THIS SESSION
- **Gap D (durable ending) — OK.** Reveal (`data-get-sandbox-url`+url) is written via the step
  writer → persists to run_events AND live stream; `updateRun(status)` follows; the reconnect
  endpoint drains a final tail after terminal status. A reconnecting client always replays the
  ending. This was structurally sound; the gap was A, not D.
- **Server enforces runId** (route.ts:1855 refuses to start an untracked build; :1932 always
  sends the header). Enforcement is real.
- **Model IDs** now verified against LIVE OpenRouter + Moonshot APIs (not memory).

## ⚠️ "DONE" CLAIMS TODAY DISPROVED (re-open mentally until a clean live run)
- #172 client reconnect "completed" — the logic existed but Gap A meant it never fired. NOW
  actually fixed (D5), but unproven on a real long build.
- G8 false-Ready / G3 reveal gate — user got neither preview NOR plain-words ending; the
  cost-kill-with-no-ending was part of that. Ending now durable, but re-verify on a live run.

## 🔜 STILL OPEN (all free to build; no paid test until user approves)
- Fallback wiring: Kimi-direct → DeepSeek Pro on error (constant added, get-contents.ts wiring TODO).
- Verify-chain cost population (stepCostUsd threaded on the type; step-side set TODO).
- Prove Trigger.dev worker path E2E (free harness) BEFORE flipping CM_ORCHESTRATOR=worker.
- Original quality items for "ANY idea, ANY complexity": G5b fixpoint repair, G5c un-failable
  import-closure, G4 relative-import pre-audit, #177 game richness, surgical edits. These are the
  "smoothly build anything" backbone — sequence AFTER the sync/cost foundation is proven.

# ═══════════════════════════════════════════════════════════════════════════════

# Codemine Deep Audit — gaps to self-sustainability (2026-08-17)

Goal: every generation completes smoothly, edits work, AI stays chatty, cost ≤ $0.40–0.50,
zero shown errors, handles ANY request. This audit marks every gap found by reading the
pipeline + the two live test builds (Kaisen all-DeepSeek, Ember fan-out).

## THE CORE FINDING (one sentence)
Almost every gate is **advisory, not enforced**: it *attempts* a repair inside `try/catch`,
logs `(non-fatal)` on failure, and **reveals the app anyway without re-verifying the fix worked**.
Plus the build **never converges** (loops expensive full-context rounds), which is BOTH the
cost blowup AND the reliability failure.

---

## COST — why the $1.13 build (answer to "why so high?")
Ember (fan-out, Sonnet spine + DeepSeek leaves), verified from run 6451f5f7 events:
- **16 final files** — BUT **4 generation rounds** (`start-step`×4, 4 generateFiles calls) and
  **52 write-batches** → files were **regenerated ~3×**.
- $1.13 ≈ 3× the work a clean build needs. Each round **re-sends the full prompt+context** to
  Sonnet ($10/M output). The rounds happen because **stubs never resolve → buildProject loops
  stepGenerate2** (see G1).
- **A single Sonnet pass of ~16 files ≈ $0.35–0.45.** The user is RIGHT: reusable scaffold →
  limited files → cheap. The blowup is the runaway rounds, NOT the model or the file count and
  NOT the "creative mind." Fix convergence → ~1 round → in-target cost. **Cost = convergence.**

---

## GAPS (marked, prioritized)

### G1 — Build never converges → multi-round cost blowup + runaway  [CRITICAL, cost+reliability]
- buildProject loops `stepGenerate2` while `!generationComplete` (stubs remain), up to 3 rounds.
- Each continuation round **re-plans a DIVERGENT tree** (Kaisen: round1 `src/lib/content.ts`,
  round2 `src/data/content.ts`; Ember: 4 rounds, 3× regeneration) → stubs never converge →
  burns all rounds → 3–4× the tokens + 3–4× the time (→ sandbox-death risk, G7).
- ROOT: stepGenerate2 does NOT reuse round-1's manifest; the model re-decides file paths each round.
- FIX DIRECTION: pin the round-1 manifest as the immutable file list; stepGenerate2 may only
  COMPLETE those exact stub paths, never invent new ones. Mechanical: reject any path not in the
  frozen manifest.

### G2 — Import-closure is non-fatal → missing file → BLANK preview  [CRITICAL, caused Ember blank]
- `generate-files.ts:512` closure generates missing `./ ../ @/` imports, BUT wrapped in
  `try/catch` → `[closure] pass failed (non-fatal)` (line 592). If the closure model call
  fails/times out, the missing file is **silently skipped** → Vite 500 → blank `#root`.
- Ember: `src/data/content.ts` imported `./lib/image-utils` which was NEVER generated → blank.
- FIX DIRECTION: after closure, **re-scan for unresolved imports; if ANY remain, it MUST block**
  (retry or deterministic stub-create), never proceed to reveal. No silent skip.

### G3 — Reveal gate has escape hatches → reveals broken preview  [CRITICAL, violates rule #1]
- `build-pipeline.ts:1245` reveal gate: `while (withinBudget() && attempts<3 && rtStatus broken/null)`.
  Documented "SAFETY NET: on budget-exhaust OR unavailable check we reveal ANYWAY."
- After a 13-min/4-round build, `withinBudget()` is false → gate **skipped → broken preview revealed**.
  This is exactly how Ember's blank reached the user.
- Also: if an EARLIER check set `rtStatus='fine'`, a later killing write is never re-checked.
- FIX DIRECTION: reveal must be gated on a FINAL fresh render-check that is **mechanically
  required** — if budget is exhausted or the check is unavailable, DO NOT reveal; instead mark
  the run needs-more-time / hand to a fresh step (the durable workflow already supports chaining),
  and if truly unfixable, show the plain-words "hit send and I'll pick it up" (never a blank).

### G4 — Relative imports unchecked pre-write  [HIGH]
- `import-gate.ts` only audits `@/` alias imports (extractAtImports, fixUnknownLocalImports).
  `./ ../` relative imports are NOT audited pre-write — they rely entirely on G2's non-fatal closure.
- FIX DIRECTION: extend the pre-write closure/audit to relative specifiers with the same mechanical
  "must resolve or must be created" rule.

### G5 — Every quality gate is advisory (try/catch → non-fatal), no re-verify  [CRITICAL, architectural]
- footgun, empty-render, closure, css-closure, router-mount: ALL `try { repair } catch { warn(non-fatal) }`.
- They attempt ONE repair pass and **never confirm the repair actually fixed the issue** before write/reveal.
- This is the root of "gates exist but errors still ship." The user's ask: "mechanically enforced,
  no choice for errors."
- FIX DIRECTION: convert each gate to a **closed loop**: scan → repair → **RE-scan → if still
  violating, escalate (frontier model) → re-scan → if STILL violating, block reveal + plain-words**.
  A gate that can't prove it passed must not let the build reveal.

### G6 — Cost telemetry reads 0 → blind on cost  [HIGH, blocks the whole cost effort]
- `tokens_used=0` on every project. Root: `tokenStore.enterWith` in makeStepWriter does NOT
  propagate through the AI-SDK stream transforms (the exact ALS gotcha route.ts:1847 documents;
  that's why the chat route wraps stream CONSUMPTION in tokenStore.run, not enterWith).
- Impact: no per-build cost visibility → every cost decision is guesswork (we rely on OpenRouter
  balance-delta manually).
- FIX DIRECTION: wrap each step's model-consuming work in `tokenStore.run(...)` (not enterWith),
  OR emit a `data-token-summary` run-event from the metrics middleware as the black-box record.

### G7 — Sandbox dies on long builds  [HIGH, partially mitigated]
- Kaisen: first sandbox died ~18.8 min in (before its 30-min timeout). LIKELY compounded by my
  test navigating the tab mid-build (pagehide → kill-beacon, components/sandbox-lifecycle.tsx) —
  Ember (no navigation) did NOT die. So partly a TEST artifact, but long builds still approach the
  ceiling.
- Mitigations already shipped this session: reapAbandonedRuns backstop (fail+message >45min).
- FIX DIRECTION: fixing G1 (1 round) keeps builds short → removes most of this risk. Also
  consider a mid-build heartbeat/snapshot.

### G8 — False "Ready" (client shows Ready while server still churning)  [HIGH, trust]
- Kaisen: UI showed "Ready" at ~13 min while the workflow churned to 31 min in the background.
  Client reacts to stream-close, not true server completion.
- FIX DIRECTION: the "Ready"/reveal state must be driven ONLY by the server's terminal
  reveal event (data-get-sandbox-url done + ready-narration), never by stream-close alone.

### G9 — Fan-out inherits DeepSeek sprawl  [MEDIUM]
- Leaves on DeepSeek Pro sprawl (many section files) and add rounds → feeds G1. Fan-out only saved
  ~20% vs all-Sonnet AND cost $1.13 here.
- OPEN QUESTION for user: is fan-out worth it? If G1 is fixed and a clean 1-round Sonnet build is
  ~$0.40, fan-out's complexity may not be worth the ~20% when it risks divergence. User leaning
  fan-out but asked "is DeepSeek even needed / could DeepSeek FLASH do leaves?" — Flash is cheaper
  but lower quality; leaves are design-critical (visible sections) so Flash risks "broken/ugly code."
  RECOMMENDATION: fix G1 first, re-measure clean single-pass Sonnet cost; decide fan-out on real data.

---

## WHAT "MECHANICALLY ENFORCED" MEANS (the target architecture)
Today: scan → attempt one repair → swallow failure → reveal.
Target: **scan → repair → RE-scan (prove) → escalate if needed → RE-scan → BLOCK reveal if still
broken** (fall back to plain-words handoff, NEVER a blank). Every gate returns a hard pass/fail;
reveal is contingent on ALL gates proving pass on a FINAL fresh check. Convergence uses a FROZEN
manifest so rounds complete stubs instead of re-planning.

## PRIORITY ORDER (recommended)
1. G1 convergence (frozen manifest) — fixes cost AND runaway AND most of G7. Highest leverage.
2. G2+G4+G5 enforce closure/gates (re-verify, block-on-fail) — kills blank previews.
3. G3 reveal gate (no escape-hatch reveal of broken) — the last line of defense.
4. G6 telemetry (real cost numbers) — then re-measure and decide fan-out (G9).
5. G8 false-Ready — trust polish.

## FABLE'S REVIEW (2026-08-17) — the deeper root + industry patterns
DIAGNOSIS (one layer deeper than "advisory not enforced"): the pipeline TRUSTS ITS OWN REGEX SCANS
over the ground-truth ORACLE it already has (the compiler/bundler), and every ground-truth check is
skippable. Concrete:
- (a) The ONE check that deterministically catches missing imports — tsc/vite build — is OPTIONAL
  (pipeline-helpers.ts:481 logs "TYPE-CHECK SKIPPED" on timeout and proceeds). A REQUIRED
  `tsc --noEmit` / `vite build` exit-0 in the sandbox is the gate everything else only approximates.
  Regex scans are heuristics; the bundler is truth. THIS would have caught ./lib/image-utils.
- (b) NO FIXPOINT: repairs regenerate whole files via the model → a repair can introduce a NEW
  unresolved import/footgun, and nothing re-scans after a repair. Gates must LOOP until a full pass
  = zero violations, THEN final compile, THEN reveal.
- (c) G3 contradicts our own architecture: we built unlimited step-chaining so we never ship broken,
  then reveal-broken on budget-exhaust instead of chaining one more stepVerify2. Route both hatches
  (budget-exhaust AND `if(!wrote) break`) to chaining or plain-words handoff. NEVER a blank.
- Make closure DETERMINISTICALLY UN-FAILABLE: on closure-model failure, write a minimal valid STUB
  (we have stamp machinery) so an unresolved import can NEVER remain on disk. Model repair = quality
  path; stub = the guarantee.
INDUSTRY LEADERS (Bolt/Lovable/Cursor/Aider/v0) do 4 things we don't:
  1. COMPILER-IN-THE-LOOP as THE gate (real build/runtime errors, not text scans).
  2. SURGICAL edits (search/replace / diff blocks) for repairs — NOT full-file regen (our full-file
     repair at spine prices is part of the $1.13).
  3. ONE frontier model for generation + cheap models for AUX only. NOBODY does multi-model fan-out
     mid-build; complexity goes into the VERIFY loop, not model orchestration. Fan-out feeds G1.
  4. FROZEN plan → fill → DIFF edits; round 2 never re-plans (== our G1 fix).
MODEL VERDICT (no incumbency): Sonnet-class IS the category's revealed preference (leaders publicly
run Claude Sonnet for gen; web-dev/design arenas rank Claude top) — keeping Sonnet 5 is data, not
habit. SEPT 1 CLIFF: Sonnet 5 $2/$10 intro → $3/$15 → our ~$0.50 clean build becomes ~$0.75
(above target) — a real 2-week deadline. LUNA = highest upside BUT verify: all 4 luna variants
price identically INCLUDING :batch (batch is normally -50% → smells placeholder/promo; confirm with
one ~$0.001 real call), and GPT-5.6 family has documented 3-8min silent-think (our gateway disables
it, but speed unproven). DS Pro's "failure" was CONTAMINATED (kill-beacon + G1) — not a quality
verdict, but no reason to prefer it (3× Luna's price).
SEQUENCE: fix G1 → G5-fixpoint(+required compile) → G3 (all $0, tsc+build verifiable) → THEN one
identical-prompt A/B Sonnet 5 vs Luna on the FIXED pipeline. If a single model hits target, DELETE
fan-out (it adds the exact divergence surface G1 exists to kill). Testing BEFORE G1/G5 = measuring
the bug, not the model.

## G3+G8 IMPLEMENTATION SPEC (Fable, 2026-08-17) — exact shape
G5a DONE (commit 0b0a4e5): verifyAndRepair re-runs vite build after repair (fixpoint) + returns {vitePassed}; stepVerify seeds rtStatus='broken' when !vitePassed.
G3 (do NOT touch the reveal loop/hatches — add ONE post-loop enforcement block; all 3 hatches — budget-exhaust, `if(!fresh)break`, `if(!wrote)break` — fall through with rtStatus still 'broken'):
```
if (rtStatus === 'broken') {
  if ((revealChainCount ?? 0) < 2) return { ...checkpointFields, revealed:false, revealChainCount:n+1 }  // chain fresh stepVerify2 budget
  // cap hit → TERMINAL FAIL: plain-words narration + updateRun(status:'error') + NO preview_url write + return null
}
// else reveal exactly as today
```
- Thread `revealChainCount?: number` through VerifyCheckpoint type (one optional field — checkpoint exists to carry state across budget boundaries; do NOT use run row).
- MUST apply the IDENTICAL post-loop block in BOTH stepVerify AND stepVerify2's duplicate reveal gate (~1445+) or the first chain reveals broken anyway.
- Terminal fail placed BEFORE srv-url/revealed=true; chain path skips ready-narration/suggestions (copy the checkpoint-return pattern at ~1094/~1178).
- Escalation: if revealChainCount>0, start repairModel at FILE_GENERATION_MODEL (gateAttempts resets per step, else chained attempts restart on Flash that already failed 3×).
- FOLD IN early-exit fix: stepVerify/stepVerify2 sandbox-unreachable exits still updateRun(status:'done') silently → make 'error' + narration (also surfaces the $0.75 kill-cap cleanly not as silent 'done').
- RESIDUAL (log, maybe later): vite build fails on whole graph but render-check only sees rendered routes → build-failed + Home-fine (broken subpage import) → render-check 'fine' clears 'broken' → reveals broken subpage. Correct rule: a failed build is cleared ONLY by a passing build, not a passing render-check. Cheap step: return buildErrorDetail (the exact 'Failed to resolve import…' from /tmp/cm-verify.log) from verifyAndRepair → feed reveal-gate missing-file parser for deterministic repair.
G8 (COUPLED — must land before validation build): client flips to 'Ready' on STREAM CLOSE, not server terminal event. Drive Ready/reveal ONLY from server terminal reveal event (data-get-sandbox-url done + ready-narration). Without G8, G3's withheld-URL still shows Ready+blank (Kaisen's exact confusion).
VALIDATION (after G5a+G3+G8 deployed): ONE live build, UNCOMMON prompt, $0.75 kill-cap via balance-delta polling + POST /api/sandbox/stop, never touch app tab mid-build, POST the preview URL to user.

## FABLE REVIEW #2 (2026-08-17) — architecture correction + 2 bugs in my batch
CRITICAL ARCHITECTURE INSIGHT (industry flow): leaders REVEAL FAST + repair/enrich VISIBLY IN PLACE (Bolt/Lovable show the site improving live). This pipeline ALREADY has that: phase-1 = spine (index.css/Layout/Home/Phase2Sections) revealed fast with branded animated SHELLS, then lib/enrichment.ts (runResumableEnrichment via /api/runs/continue) fills shells LIVE via HMR. "Never reveal broken" must mean BROKEN — a designed animating shell being filled is NOT broken, it's the standard fast-preview UX.
- MY NEW1 COMPLETENESS GATE WAS WRONG + a prod regression (REVERTED commit 86bb2300): it flagged INTENDED phase-2 shells at reveal → would burn ≤6 Sonnet repairFile completions + withhold + chain on EVERY healthy build (incl Sonnet), +$0.30-0.60 & +10min each, breaking fast-preview. Kept harmless __CM_SHELL__ marker + findIncompletePages helper for the REAL fix.
- THE LIGHTHOUSE FAILURE ROOT (corrected): NOT "revealed with shells" (intended) — it was ENRICHMENT NEVER FINISHING, so shells stayed empty forever. FIX BELONGS IN ENRICHMENT (lib/enrichment.ts): guarantee enrichment fills ALL shells (resume/retry to completion), and only emit the final "✓ done/ready" narration when findIncompletePages===0 AFTER enrichment. Reveal stays fast.
- BUG1 (still open): revealChainCount NOT threaded through the mid-verify-deadline checkpoint returns (build-pipeline ~1090/~1180) → counter resets on deadline↔withhold bounce → unbounded Sonnet passes (cost), only bounded by 45-min reaper. Thread checkpoint.revealChainCount??0 through EVERY checkpoint return in both steps.
- completeIncompletePages helper still fills pages via repairFile with ONLY the shell as input (model never sees content.ts/index.css tokens → off-brand + invented imports). If reused, feed it the data file + index.css head (like fan-out fed spine context).
NEW2 ANTI-SPRAWL (Fable's simplified shape): clamp the MODEL's paths arg to generateFiles.execute (the sprawl vector), NOT the closure (demand-driven, leave alone). If frozen manifest: paths=paths.filter(in manifest || importedByAccepted); else hard cap by skill (website~24/game~10, truncate keep order). ALSO clamp manifest at plan/synthesis time (planProject itself may have sprawled to 40 — verify via $0 run_events query on the Gemini run before assuming). ~15 lines, unit-testable.
PRIORITY (Fable): 1) revert Bug2 DONE. 2) thread chain counter (Bug1). 3) NEW2 clamp + $0 manifest query. 4) ONE Sonnet validation build FIRST (reveal semantics changed on prod, never run any model through new gates; Sonnet trips gate=gate bug; then GLM). 5) G6/G5b/G4/surgical AFTER tests.
PROPER NEW1 (enrichment-side, replaces reverted reveal gate): ensure enrichment completes all shells + gate the 'done' claim (not the reveal) on findIncompletePages===0.

## BUDGET / TEST NOTES
- OpenRouter at ~$3.99 (AT the $4.00 floor) — NO paid builds until refill.
- Ground-truth cost = OpenRouter balance delta. Never navigate the app tab mid-build (kill-beacon).
  Open preview in a NEW tab. /api/version reports live model config. Chromium canary healthy.
