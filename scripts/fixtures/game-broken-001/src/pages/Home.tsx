import { useEffect, useRef, useState } from 'react'
import { VW, VH, GAME_STATE, Game, loadHighScore } from '../engine'

// DEFECT (failure class 1): `Game` from engine.ts is NOT a class, but this does
// `new Game(...)` → TypeError: Game is not a constructor at runtime.
export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const gameRef = useRef<InstanceType<typeof Game> | null>(null)
  const [best] = useState(loadHighScore())
  const [phase] = useState<string>(GAME_STATE.START)

  useEffect(() => {
    if (!canvasRef.current) return
    // ⛔ THE BUG — Game is not a constructor.
    gameRef.current = new Game(canvasRef.current)
  }, [])

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <canvas ref={canvasRef} width={VW} height={VH} />
      <div>Best: {best} — {phase}</div>
    </div>
  )
}
