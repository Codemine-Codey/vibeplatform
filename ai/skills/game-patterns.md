---
name: game-patterns
description: Web-game design + logic law — the core loop, a rigorous state machine, controls, difficulty curve, and the "juice" (screen shake, particles, sound, easing, score popups) that makes a game feel designed instead of like a tech demo. The authoritative skill for game builds.
---

> Juice/feel principles validated against Phaser's official skills + LottieFiles motion-design (both MIT). Canvas-first for simple games; Phaser via CDN for complex ones.
> PLATFORM OVERRIDES (always win): NO <svg> (Lucide for any HUD icons). Use the brief's palette + mood cohesively. Keyboard AND touch controls. localStorage high score.

# Game patterns — make it feel designed, not a demo

## The contract (decide before coding)
- **Core loop**: the one action the player repeats (flap, dodge, match, place). Make it tight and responsive — input latency is death.
- **State machine**: ONE explicit state var — `Start → Playing → Paused → GameOver → (replay)`. Never ambiguous; every transition is explicit. Pause actually freezes the loop (cancel/resume rAF).
- **Win/lose**: clear, reachable conditions for both. No soft-locks.
- **Difficulty curve**: start easy, ramp. Speed/spawn-rate scales with score or time.

## The loop (do it right)
- `requestAnimationFrame` loop with a **fixed timestep** for physics (accumulate dt; step at e.g. 1/60s) so behavior is frame-rate independent. Render interpolated.
- Keep game logic separate from rendering (update() then draw()). Constants (speeds, sizes, gravity, colors) at the TOP of the file, easy to tune.
- Clear the canvas each frame; draw back-to-front (background → entities → particles → HUD).

## Juice — this is what makes it feel good (NON-NEGOTIABLE)
Every one of these is cheap and transforms the feel:
- **Easing on everything that moves** — no linear snaps. Ease-out for entrances, ease-in for exits (LottieFiles principle: entrances decelerate, exits accelerate).
- **Screen shake** on impact/crash: offset the canvas translate by a small random amount that decays over ~200ms (`shake *= 0.9` each frame).
- **Particles** on score/collision: spawn 8–20 small dots/squares with random velocity + gravity + fade; pool them, don't allocate per frame.
- **Score popups**: floating "+1" text that rises and fades.
- **Hit-stop / flash**: a 1–3 frame freeze or white flash on big impacts sells weight.
- **Sound** via Web Audio API — even basic oscillator tones for flap/score/crash/jump. A game with no sound feels dead. Gate behind a first user gesture (autoplay policy).
- **Anticipation + follow-through**: a tiny squash/stretch on jump/land reads as alive.

## Controls
- Map BOTH keyboard and touch. Show the controls on the start screen.
- Input buffering/forgiveness: a jump pressed just before landing should still fire — forgiveness feels good.
- Pointer/touch: large hit areas; prevent default scroll/zoom on the canvas.

## Theme cohesion (the start screen sets the tone)
- Background, entities, particles, and HUD share one palette + mood. A neon arcade game and a pastel zen game should look nothing alike.
- Start screen: title in a display font, a one-line hook, a clear Play button, the high score, the controls.
- Game-over: score + best, a reason if relevant, and an obvious replay (key + tap).

## Complexity routing
- **Simple** (flappy, snake, pong, breakout, runner): pure HTML5 Canvas, one or two files.
- **Complex** (platformers, physics, many entities, tilemaps): Phaser 4 via CDN — use its cameras (`camera.shake()`, `fade`), particle emitters (`emitter.explode()`), tweens (easing), and arcade physics to get the juice above without hand-rolling it.
