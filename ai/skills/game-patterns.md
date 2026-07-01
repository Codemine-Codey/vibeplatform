---
name: game-patterns
description: Web-game design + logic law — the loop, a rigorous state machine, controls, difficulty, and the "juice" (screen shake, particles, sound, easing, hit-stop) that makes a game feel designed, not a tech demo. Always-injected for game builds.
---

# Game Design Law — make it feel ALIVE, not a demo

> Canvas-first for simple games; three + @react-three/fiber + drei (pre-installed) for 3D; howler for audio; zustand for game state. NO <svg> (Lucide for HUD icons). Keyboard AND touch. localStorage high score.

## 0. CORRECTNESS — the silent bugs that make a game look broken (READ FIRST)
A polished, correct game beats a juicy broken one. These are the exact failures that read as "amateur" — each is non-negotiable:
- **KEEP CANVAS GAMES COMPACT — this prevents truncation AND styling bugs.** A canvas arcade game is a SINGLE screen: draw the start screen, gameplay, HUD, pause, and game-over ALL inside the canvas via the loop. Do NOT create separate React components (StartScreen / GameOverScreen / PauseOverlay) and do NOT use react-router or `./pages/*` — a game has no routes. The ONLY files you need are `src/App.tsx` (mounts the canvas full-screen) and ONE `src/components/game/GameCanvas.tsx` (the whole game, using the baked engine). Fewer/smaller files = the generation never truncates mid-file.
- **Games do NOT have the shadcn design tokens.** A game's `index.css` is minimal — classes like `bg-background`, `text-foreground`, `text-primary`, `font-display` resolve to NOTHING in a game and render invisible/unstyled. Use EXPLICIT colors in game React chrome (`bg-slate-900`, `text-white`) or, better, draw all text/overlays on the canvas with `ctx.fillStyle`. Never assume the semantic tokens exist in a game.
- **Use the baked engine's EXACT API:** `useGameLoop({ update, draw, running, step })` (an options object — not positional args). Import { useGameLoop, useHighScore, playTone, rectsOverlap, circlesHit, useShake, burst, stepParticles } from '@/components/game/engine' and call each exactly as exported.
- **The canvas is NEVER blank or black.** Every state (Start, Playing, GameOver) must paint a full frame. The #1 bug: the rAF loop stops on death and nothing repaints → black screen. FIX: keep the loop running in GameOver and draw the overlay every frame, OR draw the final scene + overlay once and stop clearing. On every frame, in every state, something is visible.
- **GameOver draws the overlay ON TOP of the last frame** — score, best, and an obvious "press/tap to retry" — never over a cleared/void canvas. Mentally test: player dies → overlay appears over the frozen scene, not a black void.
- **Restart fully resets ALL state** — entity positions and arrays, score, speed, spawn timers, difficulty, shake, particles — and **cancels the old rAF before starting a new loop** (null-check so two loops never run at once; a second loop = double-speed / "broken" feel).
- **Obstacles spawn cleanly and NEVER overlap or merge.** Fixed horizontal spacing derived from speed (not random positions that can overlap); generate each obstacle/pair ONCE, move it left each frame, remove it when off-screen (no leaks). Gap *position* random within safe bounds; gap *size* constant (or eased with difficulty). Two pipes touching = a bug.
- **Collision matches the visible sprite** (tight AABB or circle), not an invisible oversized box. Near-misses must not register as hits, and overlaps must.
- **One source of truth**: a single `state` variable drives both update and draw — never two flags that can disagree.
- **Effect cleanup**: `cancelAnimationFrame` + `removeEventListener` in the cleanup, so a re-render / StrictMode double-mount never spawns a second loop. Store rAF id in a ref.

## 1. The contract — decide before coding
- **Core loop**: the ONE action the player repeats (flap, dodge, match, place, shoot). Make it tight + responsive — input latency is death. The whole game is this loop made juicy.
- **State machine**: ONE explicit state variable — `Start → Playing → Paused → GameOver → (replay)`. Every transition explicit; never ambiguous. Pause actually freezes the loop (cancel/resume rAF).
- **Win/lose**: clear, reachable conditions for both. No soft-locks.
- **Difficulty curve**: starts easy, ramps. Speed / spawn-rate / complexity scales with score or time. The player should feel themselves getting better as it gets harder.

## 2. The loop — do it right
- **USE THE BAKED ENGINE — don't hand-roll the loop.** `import { useGameLoop, useHighScore, playTone } from '@/components/game/engine'`. `useGameLoop({ update, draw, running })` already does the fixed-timestep, the interpolation, and the correct cleanup (cancels rAF, never double-runs) — the exact things that break hand-written loops. You write only `update(stepMs)` and `draw(alpha)`; set `running` from your state machine (true only while Playing). `useHighScore('mygame')` persists the best; `playTone(freq)` makes a gated blip. This is the reliable foundation — use it.
- If you must hand-write it: `requestAnimationFrame` with a **fixed timestep** for physics (accumulate dt, step at 1/60s) so behavior is frame-rate independent; interpolate the render. Never tie game speed to frame rate. Store the rAF id in a ref and cancel it in cleanup.
- Separate **update()** from **draw()**. Constants (speeds, gravity, sizes, colors, spawn rates) at the TOP of the file — easy to tune.
- Clear the canvas each frame; draw back-to-front (background → entities → particles → HUD).
- Object-pool particles/bullets — never allocate per frame (GC stutter kills feel).

## 3. JUICE — this is what separates good from forgettable (NON-NEGOTIABLE)
Every one is cheap and transforms the feel. Use most of them:
- **Easing on everything that moves** — no linear snaps. Ease-out for entrances, ease-in for exits, overshoot (back-ease) for pops.
- **Screen shake** on impact/crash: offset the canvas translate by a small random amount that decays (`shake *= 0.9` each frame). Scale magnitude to impact.
- **Particles** on score/collision/death: 8-24 dots/shards with random velocity + gravity + fade + shrink. Pool them.
- **Hit-stop**: freeze the game 1-4 frames on a big impact — sells weight enormously.
- **Flash**: white/color flash on the entity (or full screen) on hit.
- **Score popups**: floating "+1"/"+100" that rises and fades. Combo counters that scale up.
- **Squash & stretch**: tiny squash on land, stretch on jump — reads as alive (anticipation + follow-through).
- **Sound** via Web Audio / howler — even basic oscillator tones for jump/score/crash/click. A silent game feels dead. Gate audio behind the first user gesture (autoplay policy). Pitch-shift repeated sounds slightly so they don't grate.
- **Trail/afterimage** on fast-moving entities. **Camera** ease-follow (lerp) the player, never hard-locked.

## 4. Controls — responsive + forgiving
- Map BOTH keyboard and touch/pointer. Show controls on the start screen.
- **Input buffering**: a jump pressed just before landing should still fire. **Coyote time**: allow a jump a few frames after leaving a platform. Forgiveness feels good.
- Large touch hit areas; `preventDefault` scroll/zoom/context-menu on the canvas. Immediate visual/audio feedback on every input.

## 5. Feel & balance
- **Game feel = responsiveness + juice + readability.** The player must always understand what's happening (clear silhouettes, contrast between player/enemies/background, telegraphed threats).
- Tune by feel, not theory: if it's not fun in the first 10 seconds, adjust the constants (speed up, add juice, tighten controls).
- Reward streaks/combos. Escalate stakes. Give "near-miss" moments (juice the close calls).

## 6. Theme cohesion — the start screen sets the tone
- Background, entities, particles, and HUD share ONE palette + mood. A neon arcade game and a pastel zen game should look nothing alike. Commit to a vibe.
- **Start screen**: title in a display font, a one-line hook, a clear Play button, the high score, the controls.
- **Game-over**: score + best (localStorage), a reason if relevant, and an obvious replay (key + tap). Make losing feel like "one more try", not a dead end.

## 7. Complexity routing
- **Simple** (flappy, snake, pong, breakout, runner, dodge): pure HTML5 Canvas 2D, one or two files.
- **3D / rich** (endless runner 3D, shooter, physics toys): three + @react-three/fiber + drei inside a `<Canvas>`; drei helpers (OrbitControls, Float, Environment, useGLTF); add @react-three/rapier for physics (on-demand). Keep it 60fps: dispose, suspense for assets, instance repeated meshes.
- **Sprite-heavy 2D**: pixi.js (on-demand). **2D physics**: matter-js (on-demand).

## 8. Pre-ship self-check
Core loop tight + responsive · explicit state machine · both controls mapped + shown · win AND lose reachable · difficulty ramps · ≥4 juice effects (shake/particles/hit-stop/sound/popups) · sound present + gated · high score persists · start + game-over screens polished · cohesive palette · 60fps (pooled particles, no per-frame alloc) · replay is one tap/key.
