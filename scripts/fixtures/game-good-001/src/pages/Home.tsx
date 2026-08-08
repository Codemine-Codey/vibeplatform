import { useEffect, useRef } from 'react'
import { VW, VH, Game } from '../engine'

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const gameRef = useRef<Game | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    gameRef.current = new Game(canvasRef.current) // valid — Game is a class
    gameRef.current.tick()
  }, [])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <canvas ref={canvasRef} width={VW} height={VH} />
    </div>
  )
}
