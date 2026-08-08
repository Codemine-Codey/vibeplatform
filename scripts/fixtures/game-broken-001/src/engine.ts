// DEFECT (failure class 1): `Game` is exported as a plain object/factory, NOT a class.
// Home.tsx does `new Game(canvas)` → TypeError: Game is not a constructor.
// The typecheck rung (tsc --noEmit) catches this deterministically.

export const VW = 400
export const VH = 600

export const GAME_STATE = { START: 'start', PLAYING: 'playing', OVER: 'over' } as const

export interface GameModel {
  birdY: number
  velocity: number
  score: number
  pipes: Array<{ x: number; gapY: number }>
  state: string
}

export function createInitialGame(): GameModel {
  return { birdY: VH / 2, velocity: 0, score: 0, pipes: [], state: GAME_STATE.START }
}

export function updateGame(g: GameModel, dt: number): GameModel {
  return { ...g, birdY: g.birdY + g.velocity * dt, velocity: g.velocity + 0.5 * dt }
}

export function flap(g: GameModel): GameModel {
  return { ...g, velocity: -8 }
}

export function drawGame(_ctx: CanvasRenderingContext2D, _g: GameModel): void {
  /* draw */
}

export function loadHighScore(): number {
  return Number(localStorage.getItem('highScore') || '0')
}

export function saveHighScore(s: number): void {
  localStorage.setItem('highScore', String(s))
}

export class AudioEngine {
  play(_name: string): void { /* beep */ }
}

// ⛔ THE BUG: this is a plain object, but Home.tsx calls `new Game(canvas)`.
export const Game = {
  create(_canvas: HTMLCanvasElement) {
    return createInitialGame()
  },
}
