---
name: game-patterns
description: Web-game design + logic law — the loop, a rigorous state machine, controls, difficulty, and the "juice" (screen shake, particles, sound, easing, hit-stop) that makes a game feel designed, not a tech demo. Always-injected for game builds.
---

# Game Design Law — make it feel ALIVE, not a demo

> Canvas-first for simple games; three + @react-three/fiber + drei (pre-installed) for 3D; howler for audio; zustand for game state. NO <svg> (Lucide for HUD icons). Keyboard AND touch. localStorage high score.

## 1. The contract — decide before coding
- **Core loop**: the ONE action the player repeats (flap, dodge, match, place, shoot). Make it tight + responsive — input latency is death. The whole game is this loop made juicy.
- **State machine**: ONE explicit state variable — `Start → Playing → Paused → GameOver → (replay)`. Every transition explicit; never ambiguous. Pause actually freezes the loop (cancel/resume rAF).
- **Win/lose**: clear, reachable conditions for both. No soft-locks.
- **Difficulty curve**: starts easy, ramps. Speed / spawn-rate / complexity scales with score or time. The player should feel themselves getting better as it gets harder.

## 2. The loop — do it right
- `requestAnimationFrame` with a **fixed timestep** for physics (accumulate dt, step at 1/60s) so behavior is frame-rate independent; interpolate the render. Never tie game speed to frame rate.
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
