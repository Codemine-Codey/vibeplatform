---
name: game-patterns
description: Web-game design + logic law — the loop, a rigorous state machine, controls, difficulty, and the "juice" (screen shake, particles, sound, easing, hit-stop) that makes a game feel designed, not a tech demo. Always-injected for game builds.
---

# Game Design Law — make it feel ALIVE, not a demo

> Canvas-first for simple games; three + @react-three/fiber + drei (pre-installed) for 3D; howler for audio; zustand for game state. NO <svg> (Lucide for HUD icons). Keyboard AND touch. localStorage high score.

## 0.0 ARCHITECTURE — the engineering that makes ANY game good (patterns, NOT templates)
Great games for arbitrary ideas come from these architectural principles — apply them to whatever the user asked for (flappy, snake, a shmup, a tower-defense, anything):

**1. Strict State Machine (no loose logic).** Model the game as an explicit finite state machine: `START → PLAYING → PAUSED → GAMEOVER`. Route EVERY input through the current state: Space in START boots the loop; in PLAYING it applies the physics impulse; in PAUSED it resumes; in GAMEOVER it restarts. Pause menu, game-over modal, and HUD are React overlays STACKED above the canvas (absolutely-positioned), so the UI is always responsive no matter what the loop is doing.

**2. Ref-based render loop + deterministic physics.** React state is ONLY for UI/HUD re-renders (score, high score, which screen). The fast loop — position, velocity, collisions, particles — runs in `requestAnimationFrame` using `useRef` mutable state, NEVER React state (that causes frame drops, input lag, and race conditions). Compute collisions (AABB or radial distance) BEFORE drawing, with a small safety padding so hitboxes feel fair. Bound gravity/velocity by a terminal speed so nothing clips through walls/pipes. Fixed timestep for physics; store the rAF id in a ref and cancel it in cleanup (never two loops).

**3. Modular files + a single source of truth (this is the required structure):**
```
src/
├── types.ts               # THE BLUEPRINT — shared interfaces (GameState, Pipe, Particle, Theme…) defined FIRST
├── utils/
│   ├── constants.ts       # pure config: physics params, difficulty scaling, theme tokens
│   ├── renderer.ts        # pure Canvas-2D drawing (procedural graphics, no external art)
│   ├── audio.ts           # Web Audio API oscillator SFX (zero missing-asset 404s)
│   └── storage.ts         # localStorage wrapper (scores, settings)
├── components/
│   ├── <Game>Canvas.tsx   # the physics + rAF loop, owns the canvas
│   ├── ScoreBoard.tsx     # live HUD overlay
│   ├── GameOverModal.tsx  # + StartScreen / PauseModal / SettingsModal as needed
└── pages/Home.tsx         # coordinator: owns the state machine, stacks canvas + overlays
```
Write `types.ts` FIRST (contract-first) so every file speaks the same language — no name/import/export mismatch. Adapt the file count to the game (a tiny game may fold renderer into the canvas), but ALWAYS separate the loop from the HUD and put shared types in one file.

**4. Procedural assets — NEVER external files.** Synthesize ALL sprites, particles, backgrounds and sound in code (Canvas-2D shapes/gradients + Web Audio oscillators). No `.png`/`.mp3` fetches (they 404 in the sandbox). This alone removes a whole class of "broken game" failures.

**5. Adaptive design system + juice (principles, not hardcoded art).** Every visual reads from THEME TOKENS (`skyTop`, `pipeGradient`, `groundColor`, `cloudColor`…) so the same code themes as Day / Night / Synthwave / Cyberpunk. Then add the polish that separates arcade-quality from a tech demo: **screen shake** on impact (brief canvas translate), **particle emitters** (feathers on flap, sparks on hit, stars on pickup), **rotational dynamics** (tilt the character by its velocity), **glassmorphism HUD** (`backdrop-blur-md`, high-contrast display/mono type for scores), easing, and hit-stop. A simple shape with juice beats a detailed sprite without it.

## 0. CORRECTNESS — the silent bugs that make a game look broken (READ FIRST)
A polished, correct game beats a juicy broken one. These are the exact failures that read as "amateur" — each is non-negotiable:
- **STRUCTURE THE GAME INTO CLEAN MODULES (adapt the count to complexity).** The whole project is written in ONE coherent pass, so you are NOT limited to one file — split by responsibility like a real codebase: `src/pages/Home.tsx` (the coordinator — owns the state machine Menu→Playing→GameOver and mounts the canvas), `src/game/` (the loop/engine + systems: physics, collision, input, spawning), `src/game/entities/` (player/bird, pipes/obstacles, particles), `src/components/` (GameCanvas wrapper with ResizeObserver, HUD, StartMenu, GameOverModal), `src/types/game.ts` (shared enums/interfaces — the ONE source of truth for state/entity shapes so names never mismatch across files), `src/utils/storage.ts` (high score). A simple game (flappy, pong) may need only 3–5 of these; a rich game more — create a file only when it earns its place, never bloat. A game still has ONE page (no react-router). **NEVER write `src/App.tsx` or `src/main.tsx`** (scaffolded + read-only). Import every shared type/const from `src/types`/one module so exports and imports stay consistent.
- **Games do NOT have the shadcn design tokens.** A game's `index.css` is minimal — classes like `bg-background`, `text-foreground`, `text-primary`, `font-display` resolve to NOTHING in a game and render invisible/unstyled. Use EXPLICIT colors in game React chrome (`bg-slate-900`, `text-white`) or, better, draw all text/overlays on the canvas with `ctx.fillStyle`. Never assume the semantic tokens exist in a game.
- **Use the baked engine's EXACT API:** `useGameLoop({ update, draw, running, step })` (an options object — not positional args). Import from `'@/components/game/engine'` — exports:
  - `useGameLoop, useHighScore, playTone` — loop, persistence, audio
  - `rectsOverlap, circlesHit` — collision
  - `useShake, burst, stepParticles` — juice
  - `SPEEDS, SPAWN` — tuned constants (flappy, runner, snake, pong, breakout, spaceShooter, platformer)
  - `generateTerrain(W, H, seed?), terrainYAt(terrain, x, totalWidth)` — terrain for physics/vehicle games
  - `VEHICLE_PHYSICS` — gravity, thrust, friction, bounce, crashVy, maxVy, wheelR, fuelDrain constants
  Call each exactly as exported. Never hand-roll what the engine already provides.
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

## 0.2 FIXED LOGICAL RESOLUTION — the ONLY correct way to size a canvas game (READ — critical bug)
**THE #1 GAME BUG: a "dinosaur bird".** If you size the drawing buffer to the full window
(`canvas.width = clientWidth*dpr` → ~1920) and then size entities as a fraction of that (bird =
`0.035*W` → 134px), everything is ENORMOUS on a desktop and the physics (tuned to an ~800px-tall
canvas) feel uncontrollable. This reads as "huge sprites + broken controls". NEVER do this.

**ALWAYS use a fixed logical resolution + scale-to-fit (what every real web game does):**
- Pick a FIXED logical play area for the game world and NEVER change it with screen size:
  portrait games (flappy, doodle-jump) → **`const VW = 480, VH = 720`**; landscape (runner, shooter,
  platformer) → **`960 × 540`**; square (snake, tetris, breakout) → **`600 × 600`** (or the grid size).
- ALL game logic + entity sizes + speeds use VW/VH — so a flappy bird is `~0.055*VW ≈ 26px`, always
  sensible, on every screen. Entities are a fixed size in the world; the SCREEN just scales.
- Render at the logical size × dpr: `canvas.width = VW*dpr; canvas.height = VH*dpr`,
  `ctx.setTransform(dpr,0,0,dpr,0,0)`, and draw in VW×VH coordinates.
- SCALE THE DISPLAY to fit the container with CSS, keeping aspect (letterbox): wrapper `<div>` at
  `width:100%; height:100dvh; display:flex; align-items:center; justify-content:center; overflow:hidden`,
  and the canvas `style={{ width:'auto', height:'auto', maxWidth:'100%', maxHeight:'100%', aspectRatio:'VW/VH' }}`
  (or compute a scale = min(containerW/VW, containerH/VH) and set canvas.style.width = VW*scale). The
  INTERNAL resolution never changes; only the on-screen size does. Crisp on mobile AND desktop.
- Test mentally at 375px wide AND a 1920px desktop: the bird is the SAME sensible size relative to the
  play field in both; the whole field is visible, centered, letterboxed, never stretched or clipped.
- (Grid games: VW/VH = cols*cell × rows*cell; the cell size is fixed, e.g. 24px, not a fraction of the window.)

## 0.5 TUNED CONSTANTS — so it PLAYS right, not turtle-slow OR brutally hard (READ)
A game that compiles but plays wrong (ball crawling, jump too floaty) is a FAILURE. Speeds must be
tuned to the canvas size and a 60fps step — never tiny absolute pixel values. Before coding, write a
short spec block at the top of the file with these, sized RELATIVE to the canvas (W = canvas width,
H = canvas height, per 1/60s step):
- **Horizontal scroll / projectile speed:** ~0.6–1.2% of W per frame (e.g. `W*0.008` to `W*0.012`) — a full-width crossing in ~1.5–2.5s. A "fast" arcade feel is ~1% of W/frame. NEVER 1–2px on a 900px canvas (that's the turtle-ball).
- **Player move speed:** ~0.8–1.5% of W per frame; snappy, reaches full speed in a few frames.
- **Gravity (jumpers):** ~0.15–0.35% of H per frame per frame; jump impulse ~1.2–1.8% of H so the arc peaks in ~0.4–0.6s. Flappy-style: gravity ≈ `H*0.0016`, flap ≈ `-H*0.010`.
- **FLAPPY DIFFICULTY — start FORGIVING (it was shipping brutally hard):** the pipe GAP must be GENEROUS — `gap ≈ H*0.30` at the start (a full third of the height), never below `H*0.24` even at max difficulty. Start SCROLL SLOW — `W*0.004–0.005` per frame (a leisurely drift), and pipe SPACING wide — a new pipe every `~1.8–2.2s`. The first 20 seconds must be EASY and beatable by a first-timer. Ramp gently: shrink the gap and raise the speed by only ~3–5% per ~5 points, and CAP both (gap floor `H*0.24`, speed ceiling `W*0.009`). If a new player can't get past the first few pipes, it is TOO HARD — loosen it.
- **Ball games (breakout/pong):** ball speed ~0.8–1.1% of the diagonal per frame; paddle a bit faster than the ball.
- **Spawn cadence:** obstacles every ~1.1–1.8s at start (flappy: 1.8–2.2s), tightening with difficulty; spacing derived from speed so they never overlap.
- **Difficulty ramp:** scale speed/spawn by ~3–8% per milestone, CAPPED (never unplayable). Err on the side of TOO EASY — a game the player can enjoy beats one they rage-quit in 5 seconds.
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

---

## 9. PLATFORMER RECIPE — precise, forgiving controls

For any side-scroller, platformer, or gravity-based runner:

```typescript
// Import tuned constants from the engine
import { SPEEDS } from '@/components/game/engine'
const { runAccel, runMax, gravity, jump, coyoteMs, jumpBufferMs } = SPEEDS.platformer

// Player physics state (all in useRef)
type Player = { x: number; y: number; vx: number; vy: number; onGround: boolean; coyoteAt: number; jumpBufferAt: number }

function updatePlayer(p: Player, keys: Set<string>, platforms: {x:number;y:number;w:number;h:number}[], now: number, W: number, H: number) {
  // Horizontal movement — acceleration model, not instant speed
  const left = keys.has('ArrowLeft') || keys.has('a')
  const right = keys.has('ArrowRight') || keys.has('d')
  if (right) p.vx = Math.min(p.vx + runAccel, runMax)
  else if (left) p.vx = Math.max(p.vx - runAccel, -runMax)
  else p.vx *= 0.78  // friction when no key held

  // Gravity
  p.vy = Math.min(p.vy + gravity, 18)

  // Move + platform collision (X then Y separately to avoid corner sticking)
  p.x += p.vx
  p.y += p.vy

  let landed = false
  for (const pl of platforms) {
    if (p.x + 12 > pl.x && p.x - 12 < pl.x + pl.w) {
      if (p.vy >= 0 && p.y - p.vy <= pl.y && p.y >= pl.y) {
        p.y = pl.y; p.vy = 0; landed = true
      }
    }
  }
  if (p.y >= H - 20) { p.y = H - 20; p.vy = 0; landed = true }  // floor
  if (landed) { p.onGround = true; p.coyoteAt = now }
  else if (p.onGround) { p.onGround = false; p.coyoteAt = now }  // just left platform

  // Jump — with coyote time and jump buffer (forgiveness)
  const spaceJustPressed = keys.has(' ')  // track via keydown event, not held state
  if (spaceJustPressed) p.jumpBufferAt = now
  const coyoteOk = now - p.coyoteAt < coyoteMs
  const bufferOk = now - p.jumpBufferAt < jumpBufferMs
  if ((coyoteOk || p.onGround) && bufferOk) {
    p.vy = jump; p.onGround = false; p.jumpBufferAt = 0
  }

  // Clamp to world
  p.x = Math.max(12, Math.min(W - 12, p.x))
}
```

**Platform generation**: static array of `{x, y, w, h}` rectangles. For infinite runners, spawn platforms off-screen right, remove when off-screen left.
**Enemies**: AABB collision, simple patrol (reverse vx at edges). **Collectibles**: AABB, remove on collect, score++.
**Camera**: `ctx.translate(-cameraX, 0)` in draw; lerp cameraX toward `player.x - W*0.3`.

---

## 10. SPACE SHOOTER RECIPE — bullets, waves, object pooling

For any top-down or side-scrolling shooter:

```typescript
// Pool-based bullet + enemy system — no per-frame allocation
type Bullet = { x: number; y: number; vy: number; active: boolean }
type Enemy  = { x: number; y: number; vx: number; vy: number; hp: number; active: boolean }

// Pre-allocate pools
const BULLET_POOL = 60, ENEMY_POOL = 30
const bullets: Bullet[] = Array.from({ length: BULLET_POOL }, () => ({ x:0,y:0,vy:0,active:false }))
const enemies: Enemy[]  = Array.from({ length: ENEMY_POOL  }, () => ({ x:0,y:0,vx:0,vy:0,hp:1,active:false }))

function fireBullet(bx: number, by: number, vy: number) {
  const b = bullets.find(b => !b.active)
  if (b) { b.x = bx; b.y = by; b.vy = vy; b.active = true }
}
function spawnEnemy(x: number, y: number) {
  const e = enemies.find(e => !e.active)
  if (e) { e.x = x; e.y = y; e.vx = (Math.random()-0.5)*2; e.vy = 1.5+Math.random(); e.hp = 1; e.active = true }
}

function updateShooter(gs: GameState, keys: Set<string>, W: number, H: number, now: number) {
  // Player movement (8-directional, speed from SPEEDS.spaceShooter)
  const spd = 6
  if (keys.has('ArrowLeft'))  gs.player.x -= spd
  if (keys.has('ArrowRight')) gs.player.x += spd
  if (keys.has('ArrowUp'))    gs.player.y -= spd
  if (keys.has('ArrowDown'))  gs.player.y += spd
  gs.player.x = Math.max(16, Math.min(W-16, gs.player.x))
  gs.player.y = Math.max(16, Math.min(H-16, gs.player.y))

  // Auto-fire every 250ms
  if (now - gs.lastShot > 250) { fireBullet(gs.player.x, gs.player.y - 20, -9); gs.lastShot = now }

  // Update bullets
  for (const b of bullets) {
    if (!b.active) continue
    b.y += b.vy
    if (b.y < -10 || b.y > H + 10) { b.active = false; continue }
    for (const e of enemies) {
      if (!e.active) continue
      if (Math.abs(b.x - e.x) < 18 && Math.abs(b.y - e.y) < 18) {
        b.active = false; e.hp--
        if (e.hp <= 0) { e.active = false; gs.score += 10 }
      }
    }
  }

  // Update enemies + player collision
  for (const e of enemies) {
    if (!e.active) continue
    e.x += e.vx; e.y += e.vy
    if (e.y > H + 20) { e.active = false; continue }
    if (Math.abs(e.x - gs.player.x) < 20 && Math.abs(e.y - gs.player.y) < 20) gs.phase = 'over'
  }

  // Wave spawner — tightens with score
  const waveGap = Math.max(600, 1400 - gs.score * 2)
  if (now - gs.lastSpawn > waveGap) {
    for (let i = 0; i < Math.min(3 + Math.floor(gs.score/50), 8); i++) spawnEnemy(Math.random()*W, -20)
    gs.lastSpawn = now
  }
}
```

**Draw loop**: clear → draw background → enemies → player → bullets → particles → HUD. Never skip the clear.
**Powerups**: spawn every ~10s, AABB collect: shield (3 hits), rapid-fire (5s timer), bomb (clear screen).
