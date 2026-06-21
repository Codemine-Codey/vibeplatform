---
name: game-patterns
description: Web-game craft — the core loop, a clean state machine, controls, win/lose, difficulty curve, and "juice" (screen shake, particles, sound, score popups) that lifts a game from tech-demo to feels-designed. Load for any game build.
---

# Game patterns — make it feel designed, not a demo

## The contract (decide before coding)
- **Core loop**: the one action the player repeats (flap, dodge, match, place) — make it tight and responsive.
- **State machine**: Start screen → Playing → Paused → Game Over → (replay). One explicit state variable; never ambiguous.
- **Controls**: keyboard AND touch. Map both. Show the controls on the start screen.
- **Win/lose**: clear conditions; both must be reachable. No soft-locks.
- **Difficulty curve**: starts easy, ramps. Speed/spawn-rate scales with score/time.

## Juice (this is what makes it feel good — non-negotiable)
- Screen shake on impact/crash (small, brief).
- Particle burst on score/collision (simple divs or canvas dots).
- Score popups ("+1") that float and fade.
- Web Audio API sound cues — even basic oscillator tones for flap/score/crash.
- Easing on everything that moves (no linear snaps).

## Implementation
- Simple games: pure HTML5 Canvas with a `requestAnimationFrame` loop. Fixed timestep for physics.
- Keep all game logic in 1–2 files; constants (speeds, sizes, colors) at the top, easy to tune.
- localStorage high score, shown on start + game-over.
- Pause actually freezes the loop (cancel/resume rAF).

## Theme cohesion
- Background, entities, and UI share one palette and mood. A "neon arcade" game and a "pastel zen" game should look nothing alike.
- The start screen sets the tone: title in a display font, a one-line hook, a clear Play button.
