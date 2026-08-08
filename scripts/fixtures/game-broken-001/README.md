# Golden Fixture: game-broken-001

Synthesized from the real failed flappy-bird build on 2026-08-08
(sandbox sb-7how6lvrrm6z, cost $0.4558, revealed a blank screen).

The literal sandbox bytes were unrecoverable (OIDC token expired), but the
**failure classes** below are reproduced faithfully from the captured console
errors and curled source. This fixture exists so the gate ladder can be tested
against it with ZERO LLM calls, forever.

## The three failure classes this fixture encodes

1. **Non-class used as a constructor** (`src/engine.ts` + `src/pages/Home.tsx`)
   - `engine.ts` exports `Game` as a plain object/factory, NOT a class.
   - `Home.tsx` does `new Game(canvas)`.
   - Runtime: `TypeError: Game is not a constructor` → React crash → blank.
   - **Expected gate catch:** TYPECHECK (rung 3, `tsc --noEmit`) — deterministic, free.

2. **Import of a file that does not exist** (`src/App.tsx`)
   - `App.tsx` imports `./pages/Game`, which was never generated.
   - Runtime: Vite "Failed to resolve import" → 500 → blank.
   - **Expected gate catch:** RESOLVE (rung 2, in-memory, before the file is even
     written) — the import resolves to nothing in (manifest ∪ written ∪ node_modules).

3. **Stale dev server after a late repair** (pipeline behavior, not a file)
   - Tonight the missing file WAS created by repair (HTTP 200), but Vite kept
     serving the cached resolve error because nothing refreshed/re-checked.
   - **Expected fix:** repair protocol = fix → refresh dev server → re-run ladder →
     only then promote. Repair has no reveal authority.

## Acceptance for the gate ladder (Phase 2/3)

Running the ladder against this fixture MUST:
- RESOLVE fails on `App.tsx` → `./pages/Game` (before write).
- TYPECHECK fails on `Home.tsx` → `new Game()` on non-constructor.
- Neither is ever revealed to the user.
- After deterministic codemod (stamp missing file) + bounded LLM repair (make Game
  a class), a re-run of the ladder passes, and only then is the preview promoted.
