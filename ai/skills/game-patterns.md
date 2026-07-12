---
name: game-patterns
description: Web-game design + logic law — the loop, a rigorous state machine, controls, difficulty, and the "juice" (screen shake, particles, sound, easing, hit-stop) that makes a game feel designed, not a tech demo. Always-injected for game builds.
---

# Game Design Law — make it feel ALIVE, not a demo

> Canvas-first for simple games; three + @react-three/fiber + drei (pre-installed) for 3D; howler for audio; zustand for game state. NO <svg> (Lucide for HUD icons). Keyboard AND touch. localStorage high score.

## 0. CORRECTNESS — the silent bugs that make a game look broken (READ FIRST)
A polished, correct game beats a juicy broken one. These are the exact failures that read as "amateur" — each is non-negotiable:
- **KEEP CANVAS GAMES COMPACT — this prevents truncation AND styling bugs.** A canvas arcade game is a SINGLE screen: draw the start screen, gameplay, HUD, pause, and game-over ALL inside the canvas via the loop. Do NOT create separate React components (StartScreen / GameOverScreen / PauseOverlay) and do NOT use react-router or add extra routes — a game has ONE page. **NEVER write `src/App.tsx` or `src/main.tsx`** (both are scaffolded + read-only; the scaffold's App already mounts your root page). The ONLY files you need are `src/pages/Home.tsx` (the game root — mounts the canvas full-screen) and ONE `src/components/game/GameCanvas.tsx` (the whole game, using the baked engine). Fewer/smaller files = the generation never truncates mid-file.
- **Games do NOT have the shadcn design tokens.** A game's `index.css` is minimal — classes like `bg-background`, `text-foreground`, `text-primary`, `font-display` resolve to NOTHING in a game and render invisible/unstyled. Use EXPLICIT colors in game React chrome (`bg-slate-900`, `text-white`) or, better, draw all text/overlays on the canvas with `ctx.fillStyle`. Never assume the semantic tokens exist in a game.
- **Use the baked engine's EXACT API:** `useGameLoop({ update, draw, running, step })` (an options object — not positional args). Import { useGameLoop, useHighScore, playTone, rectsOverlap, circlesHit, useShake, burst, stepParticles } from '@/components/game/engine' and call each exactly as exported.
- **The canvas is NEVER blank or black.** Every state (Start, Playing, GameOver) must paint a full frame. The #1 bug: the rAF loop stops on death and nothing repaints → black screen. FIX: keep the loop running in GameOver and draw the overlay every frame, OR draw the final scene + overlay once and stop clearing. On every frame, in every state, something is visible.
- **GameOver draws the overlay ON TOP of the last frame** — score, best, and an obvious "press/tap to retry" — never over a cleared/void canvas. Mentally test: player dies → overlay appears over the frozen scene, not a black void.
- **Restart fully resets ALL state** — entity positions and arrays, score, speed, spawn timers, difficulty, shake, particles — and **cancels the old rAF before starting a new loop** (null-check so two loops never run at once; a second loop = double-speed / "broken" feel).
- **Obstacles spawn cleanly and NEVER overlap or merge.** Fixed horizontal spacing derived from speed (not random positions that can overlap); generate each obstacle/pair ONCE, move it left each frame, remove it when off-screen (no leaks). Gap *position* random within safe bounds; gap *size* constant (or eased with difficulty). Two pipes touching = a bug.
- **Collision matches the visible sprite** (tight AABB or circle), not an invisible oversized box. Near-misses must not register as hits, and overlaps must.
- **One source of truth**: a single `state` variable drives both update and draw — never two flags that can disagree.
- **Effect cleanup**: `cancelAnimationFrame` + `removeEventListener` in the cleanup, so a re-render / StrictMode double-mount never spawns a second loop. Store rAF id in a ref.

## 0.1 SNAKE / GRID GAME BUGS — guaranteed to break if you miss these

Snake is the most commonly requested grid game. Every point below is a real bug seen in AI-generated snake games. Fix all of them:

- **Food MUST spawn on an empty cell.** The only correct algorithm: `do { food = randomCell() } while (snakeCells.has(cellKey(food)))`. Any other approach (random position, check just head, not using a Set) WILL eventually spawn food inside the snake → the snake "eats" it instantly with no visible food → game freezes or double-scores. Always use a Set of occupied cell keys.
- **Prevent 180° reversal.** If moving right, pressing left must be silently ignored. Check: `if (nextDir.x !== -dir.x || nextDir.y !== -dir.y) dir = nextDir`. Without this, pressing the opposite direction kills the player on the first turn.
- **Direction input buffering.** Only apply ONE direction change per tick. If the player presses two keys between ticks (common on fast play), only the first queued direction counts. Use a queue of max length 1.
- **Self-collision: check the new head against ALL body cells EXCEPT the last tail cell** (which will have moved away this tick). A naïve check against the full body incorrectly kills the player when turning.
- **Score is the number of food eaten, not the snake length minus starting length.** Increment score in the same `if (ate)` branch. Display it every frame.
- **Speed ramp: use `setInterval` timer, not rAF speed.** Reduce the interval by ~5ms every 5 points, floor at ~60ms. rAF-based snake ties speed to frame rate and is harder to tune.

```typescript
// Correct food spawn (ALWAYS do it this way):
function spawnFood(snake: {x:number,y:number}[], cols: number, rows: number) {
  const occupied = new Set(snake.map(s => s.x + ',' + s.y))
  let f: {x:number,y:number}
  do { f = { x: Math.floor(Math.random()*cols), y: Math.floor(Math.random()*rows) } }
  while (occupied.has(f.x+','+f.y))
  return f
}
```

## 0.5 TUNED CONSTANTS — so it PLAYS right, not turtle-slow (READ)
A game that compiles but plays wrong (ball crawling, jump too floaty) is a FAILURE. Speeds must be
tuned to the canvas size and a 60fps step — never tiny absolute pixel values. Before coding, write a
short spec block at the top of the file with these, sized RELATIVE to the canvas (W = canvas width,
H = canvas height, per 1/60s step):
- **Horizontal scroll / projectile speed:** ~0.6–1.2% of W per frame (e.g. `W*0.008` to `W*0.012`) — a full-width crossing in ~1.5–2.5s. A "fast" arcade feel is ~1% of W/frame. NEVER 1–2px on a 900px canvas (that's the turtle-ball).
- **Player move speed:** ~0.8–1.5% of W per frame; snappy, reaches full speed in a few frames.
- **Gravity (jumpers):** ~0.15–0.35% of H per frame per frame; jump impulse ~1.2–1.8% of H so the arc peaks in ~0.4–0.6s. Flappy-style: gravity ≈ `H*0.0016`, flap ≈ `-H*0.010`.
- **Ball games (breakout/pong):** ball speed ~0.8–1.1% of the diagonal per frame; paddle a bit faster than the ball.
- **Spawn cadence:** obstacles every ~1.1–1.8s at start, tightening with difficulty; spacing derived from speed so they never overlap.
- **Difficulty ramp:** scale speed/spawn by ~5–12% per milestone, capped (never unplayable).
Rule of thumb: if the main mover doesn't visibly cross a meaningful part of the screen within ~2 seconds, it's TOO SLOW — raise the constant. Tune by feel: fun in the first 10 seconds or adjust.

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

⚠️ CRITICAL — controls not working is an instant user-abandon. Get this exactly right:

**Keyboard**: ALWAYS register on `window`, never on the canvas element. `canvas.addEventListener('keydown')` silently does nothing — canvas elements don't receive key events unless explicitly focused. Use `window.addEventListener('keydown', handler)` inside `useEffect` with cleanup `return () => window.removeEventListener('keydown', handler)`. Test every key mapping before claiming done.

**Touch**: Attach to the canvas div wrapper (or `window`). Handle `touchstart` and `touchend`. Call `e.preventDefault()` inside the handler (and pass `{ passive: false }` to addEventListener) to block scroll/zoom. On mobile, tap = jump/action.

**CRITICAL — two patterns, never mix them up:**

**A) One-shot actions (jump, shoot, fire, start/restart)** — trigger directly in the `keydown` handler. One press = one event, exactly right.

**B) Continuous movement (hold ArrowLeft to keep walking)** — NEVER trigger in the handler. The OS keyrepeat fires at ~33ms intervals with an initial 500ms delay, so holding Left makes the player stutter forward in slow lurches — the "turtle-slow" bug. Instead, track a key state map: read it every frame in `update()`.

```typescript
// Key state map — CORRECT pattern for continuous movement
const keysRef = useRef<Set<string>>(new Set())
useEffect(() => {
  const onDown = (e: KeyboardEvent) => {
    keysRef.current.add(e.code)
    // One-shot actions still belong here:
    if (e.code === 'Space' || e.code === 'ArrowUp') { /* jump impulse */ e.preventDefault() }
    if (e.code === 'KeyP') { /* toggle pause */ e.preventDefault() }
  }
  const onUp = (e: KeyboardEvent) => keysRef.current.delete(e.code)
  const onTouch = (e: TouchEvent) => { /* same one-shot action */ e.preventDefault() }
  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  window.addEventListener('touchstart', onTouch, { passive: false })
  return () => {
    window.removeEventListener('keydown', onDown)
    window.removeEventListener('keyup', onUp)
    window.removeEventListener('touchstart', onTouch)
  }
}, [])

// In your update() function — read the map every frame:
function update(dt: number) {
  if (keysRef.current.has('ArrowLeft'))  player.x -= MOVE_SPEED * dt
  if (keysRef.current.has('ArrowRight')) player.x += MOVE_SPEED * dt
  if (keysRef.current.has('ArrowUp'))    player.y -= MOVE_SPEED * dt
  if (keysRef.current.has('ArrowDown'))  player.y += MOVE_SPEED * dt
}
```

- **Input buffering**: a jump pressed just before landing should still fire. **Coyote time**: allow a jump a few frames after leaving a platform. Forgiveness feels good.
- Show controls on the start screen. Immediate visual/audio feedback on every input.

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
**Controls (check first — this is the most common failure):** keyboard on `window` not canvas · touch with `{ passive: false }` · Space/Up/Down/ArrowLeft/ArrowRight all tested · player visibly responds on key press.
Core loop tight + responsive · explicit state machine · both controls mapped + shown · win AND lose reachable · difficulty ramps · ≥4 juice effects (shake/particles/hit-stop/sound/popups) · sound present + gated · high score persists · start + game-over screens polished · cohesive palette · 60fps (pooled particles, no per-frame alloc) · replay is one tap/key.
