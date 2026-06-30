# Codemine — Honest Status (2026-07-01)

What works, what doesn't, and exactly where each problem lives. No spin.

---

## 1. Generation (prompt → working app)

| Aspect | Status | Notes |
|---|---|---|
| Design quality | ✅ Strong | Context-aware, distinctive, custom heroes/sections. Tavola, FlowBoard, StreakHive all looked genuinely designed. |
| Time to workspace | ✅ Fast | ~15–30s (Flash orchestration; BotID removed). |
| Total time | ⚠️ 8–11 min | Acceptable per user. Self-heal can push it to 13+ (the real problem below). |
| Multi-page / routing | ✅ Works | react-router-dom baked, BrowserRouter wrapped. |
| English-by-default | ✅ Fixed | Was writing Italian for an Italian brand. |
| **First-pass correctness** | ❌ **THE problem** | Cross-file contract drift: AI writes `store.ts` exporting `useStore`, then imports `useHabitStore` elsewhere. Reaches preview → slow self-heal. |

### The error classes we've seen
- **Wrong import names** (`useHabitStore` vs `useStore`) — cross-file drift. → **Export-checker (shipped) catches deterministically before preview.**
- **Wrong property access** (`s.weeklyLog` vs `s.weeklyLogs`) — NOT yet caught deterministically. Needs a working type-check or the two-phase rewrite.
- **Wrong component contract** (wrapper passes wrong props) — type-check gate *should* catch; reliability unproven.
- **Zustand selector loop, dynamic Tailwind, key={index}, process.env** — ✅ footgun scanner / substitution catch these.

---

## 2. The bug-prevention rails (the moat)

| Rail | Catches | Status |
|---|---|---|
| Footgun scanner (static) | Zustand object/method selectors, dynamic Tailwind, key={index}, keyless AnimatePresence | ✅ Shipped, in-memory, deterministic |
| `process.env` → `import.meta.env` | Vite crash class | ✅ Auto-substitution |
| **Export-checker (static)** | **Wrong import names vs real exports** | ✅ **Shipped + unit-proven** |
| Import-closure + API-surface | Missing files, contract context | ✅ Shipped |
| `vite build` verify | CSS/import/syntax crashes | ✅ Works |
| Type-check gate (tsc-in-sandbox) | Any prop/property/type error | ⚠️ **Unreliable — did NOT catch StreakHive's bugs. Needs investigation/replacement.** |
| Headless runtime smoke (console errors, blank screen) | Any runtime error pre-preview | ✅ Exists; hardened (4s settle + scroll) |
| Client self-heal (post-preview) | Anything that slipped | ⚠️ **Works but SLOW (ran 12 min once). Must become the rare exception, not the norm. Needs a hard round cap.** |

**Root-cause fix in progress:** two-phase generation — write foundation files (`types.ts`, `store.ts`) first, then write components with their exact contents in context (Lovable's incremental approach). Prevents the drift at the source.

---

## 3. Resume & Snapshot

| Feature | Status | Notes |
|---|---|---|
| `sandbox_id` persisted early | ✅ Fixed | Right after sandbox creation (was only at the end → FlowBoard lost it). |
| Early snapshot (after files written) | ✅ Fixed | Fire-and-forget before the long tail. |
| Incremental snapshot (~45s loop) | ✅ Shipped | Interruption loses ≤45s, not the project. |
| Final snapshot | ✅ Now awaited | Was fire-and-forget racing the function freeze. |
| Resume workspace (wake / rehydrate) | ✅ Should work now | Needs a clean end-to-end retest (FlowBoard failed because snapshot was NULL — now fixed). |
| Resume *generation* (continue interrupted build) | ⚠️ Partial | sanitizeMessages handles orphaned tool calls; "Continue" UX not polished. |

---

## 4. Codemine Cloud

| Feature | Status | Notes |
|---|---|---|
| Unified dashboard (one Cloud tab) | ✅ Tested | Sub-nav + descriptions; Deploy/DB/Auth folded in. |
| Deploy (CF Pages) | ✅ Works | Hard-verified wrangler deploy. |
| Database (CF D1) | ✅ Works | Now auth-gated (was open). |
| Auth (multi-tenant worker) | ✅ Tested 6/6 | Strict isolation, per-app JWT secret. Now ownership-gated setup. |
| Secrets (AES-256) | ✅ Works | Values never sent to client; AI keys refused. |
| Storage (R2) | ✅ Works | One bucket + per-project prefix; public CDN URL verified. |
| AI proxy (Codemine Codey AI) | ✅ Live | DeepSeek Flash, whitelabeled, metered; body whitelist + rate limit + cap. **Credit ENFORCEMENT off until pricing.** |
| In-app AI env injection (`.env`) | ✅ Shipped | VITE_CODEMINE_AI_URL/TOKEN written to workspace. Needs end-to-end test. |
| Custom domain | ✅ Exists | Ownership-gated. |
| Connectors | 🔜 "Coming soon" card | Not built (intentional). |

---

## 5. Security (pre-launch audit)

| ID | Issue | Status |
|---|---|---|
| C1 | `/api/database` open arbitrary SQL | ✅ Fixed (auth + ownership) |
| C2 | AI proxy uncapped spend | ✅ Fixed (whitelist + cap + rate limit) |
| C3 | RLS undefined on 3 tables | ✅ Fixed (RLS enabled) |
| H1/M1 | Deploy env/domain open + wrong CF account | ✅ Fixed |
| H2 | Deploy/auth-setup ownership | ✅ Fixed |
| H3 | Sandbox file-read open (.env exposure) | ✅ Fixed (ownership + .env block) |
| H4 | Chat route open/unthrottled | ✅ Fixed (auth + rate limit) |
| H3b | Sandbox resume/stop routes | ⏳ TODO (lower severity — session DoS) |
| M2 | Wildcard CORS on auth apps | ⏳ TODO (hardening) |
| L1–L6 | Secrets crypto, multi-tenant worker, storage, projects RLS | ✅ Verified sound |

---

## 6. UI / UX

| Item | Status |
|---|---|
| Cream consistency across workspace | ✅ Fixed (added body/html base background) |
| Logs tab hidden | ✅ |
| File count removed, file tree expanded | ✅ |
| Mobile preview (clean iframe, sized) | ✅ |
| Clickable code-window under file chips | ✅ Shipped (click a finished file → inline code panel). Needs visual confirm. |
| "Working" animation removed / Lovable activity | ✅ |

---

## 7. Top priorities (in order)
1. **Two-phase generation** — write foundation first, components with context. Kills contract drift at the source.
2. **Fix or replace the type-check gate** — catch property/type errors deterministically (the export-checker only covers import names).
3. **Hard-cap the self-heal** — never run 12 min; surface after N rounds.
4. **End-to-end retest:** resume, in-app AI, code-window, storage upload.
5. Remaining security: H3b, M2.
