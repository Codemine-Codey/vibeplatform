// Clean engine — `Game` IS a class, so `new Game()` is valid.
export const VW = 400
export const VH = 600

export class Game {
  private ctx: CanvasRenderingContext2D | null
  score = 0
  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')
  }
  tick(): void {
    if (!this.ctx) return
    this.ctx.clearRect(0, 0, VW, VH)
  }
}
