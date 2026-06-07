import type { Template } from './types'

const APP_TSX = /* tsx */ `
import { useEffect, useRef, useState, useCallback } from 'react'
import { TITLE, SUBTITLE, COLORS, FONTS, GRID, CELL } from './theme'

type Dir = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'
type Phase = 'idle' | 'playing' | 'paused' | 'over'
type Pt = { x: number; y: number }

let _actx: AudioContext | null = null
const beep = (hz: number, ms: number, type: OscillatorType = 'square', vol = 0.07) => {
  try {
    if (!_actx) _actx = new AudioContext()
    const o = _actx.createOscillator()
    const g = _actx.createGain()
    o.connect(g); g.connect(_actx.destination)
    o.type = type; o.frequency.value = hz
    g.gain.setValueAtTime(vol, _actx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, _actx.currentTime + ms / 1000)
    o.start(); o.stop(_actx.currentTime + ms / 1000)
  } catch {}
}

const rnd = (n: number) => Math.floor(Math.random() * n)
const nextFood = (snake: Pt[]): Pt => {
  let f: Pt
  do { f = { x: rnd(GRID), y: rnd(GRID) } }
  while (snake.some(s => s.x === f.x && s.y === f.y))
  return f
}
const initSnake = (): Pt[] => [{ x: 12, y: 10 }, { x: 11, y: 10 }, { x: 10, y: 10 }]
const OPPOSITE: Record<Dir, Dir> = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' }
const DELTA: Record<Dir, Pt> = { UP: { x: 0, y: -1 }, DOWN: { x: 0, y: 1 }, LEFT: { x: -1, y: 0 }, RIGHT: { x: 1, y: 0 } }

type Particle = { x: number; y: number; vx: number; vy: number; a: number; c: string }

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [score, setScore] = useState(0)
  const [hs, setHs] = useState(() => +(localStorage.getItem('cm_hs_snake') || 0))

  const snakeRef    = useRef<Pt[]>(initSnake())
  const foodRef     = useRef<Pt>(nextFood(initSnake()))
  const dirRef      = useRef<Dir>('RIGHT')
  const queueRef    = useRef<Dir[]>([])
  const liveRef     = useRef(false)
  const pausedRef   = useRef(false)
  const scRef       = useRef(0)
  const speedRef    = useRef(140)
  const lastRef     = useRef(0)
  const rafRef      = useRef(0)
  const partsRef    = useRef<Particle[]>([])
  const phaseRef    = useRef<Phase>('idle')

  const SIZE = GRID * CELL

  const draw = useCallback(() => {
    const cvs = canvas.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')!
    ctx.fillStyle = COLORS.bg
    ctx.fillRect(0, 0, SIZE, SIZE)

    ctx.strokeStyle = COLORS.grid
    ctx.lineWidth = 0.4
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, SIZE); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(SIZE, i * CELL); ctx.stroke()
    }

    const f = foodRef.current
    const pulse = 0.8 + 0.2 * Math.sin(Date.now() / 200)
    ctx.shadowBlur = 20 * pulse; ctx.shadowColor = COLORS.food
    ctx.fillStyle = COLORS.food
    ctx.beginPath()
    ctx.arc(f.x * CELL + CELL / 2, f.y * CELL + CELL / 2, CELL / 2 - 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    snakeRef.current.forEach((s, i) => {
      const isHead = i === 0
      ctx.fillStyle = isHead ? COLORS.snakeHead : COLORS.snake
      if (isHead) { ctx.shadowBlur = 14; ctx.shadowColor = COLORS.snakeHead }
      ctx.beginPath()
      ctx.roundRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2, 4)
      ctx.fill()
      ctx.shadowBlur = 0
    })

    partsRef.current = partsRef.current.filter(p => p.a > 0.02)
    partsRef.current.forEach(p => {
      ctx.globalAlpha = p.a
      ctx.fillStyle = p.c
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill()
      p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.a *= 0.87
    })
    ctx.globalAlpha = 1
  }, [SIZE])

  const endGame = useCallback(() => {
    liveRef.current = false
    cancelAnimationFrame(rafRef.current)
    beep(200, 120, 'sawtooth', 0.1)
    setTimeout(() => beep(140, 250, 'sawtooth', 0.1), 120)
    const final = scRef.current
    setHs(prev => {
      const next = Math.max(prev, final)
      localStorage.setItem('cm_hs_snake', String(next))
      return next
    })
    phaseRef.current = 'over'
    setPhase('over')
  }, [])

  const gameLoop = useCallback((ts: number) => {
    if (!liveRef.current || pausedRef.current) return
    draw()
    if (ts - lastRef.current < speedRef.current) {
      rafRef.current = requestAnimationFrame(gameLoop)
      return
    }
    lastRef.current = ts

    while (queueRef.current.length) {
      const next = queueRef.current.shift()!
      if (next !== OPPOSITE[dirRef.current]) { dirRef.current = next; break }
    }

    const d = DELTA[dirRef.current]
    const head = { x: snakeRef.current[0].x + d.x, y: snakeRef.current[0].y + d.y }
    if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) { endGame(); return }
    if (snakeRef.current.some(s => s.x === head.x && s.y === head.y)) { endGame(); return }

    const ate = head.x === foodRef.current.x && head.y === foodRef.current.y
    const next = [head, ...snakeRef.current]
    if (!ate) next.pop()
    snakeRef.current = next

    if (ate) {
      scRef.current++
      setScore(scRef.current)
      beep(660, 55, 'sine', 0.08)
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2
        const speed = 2 + Math.random() * 3
        partsRef.current.push({
          x: foodRef.current.x * CELL + CELL / 2,
          y: foodRef.current.y * CELL + CELL / 2,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1,
          a: 1, c: COLORS.food,
        })
      }
      foodRef.current = nextFood(snakeRef.current)
      speedRef.current = Math.max(60, 140 - scRef.current * 4)
    }

    rafRef.current = requestAnimationFrame(gameLoop)
  }, [draw, endGame])

  const startGame = useCallback(() => {
    snakeRef.current = initSnake()
    foodRef.current = nextFood(initSnake())
    dirRef.current = 'RIGHT'
    queueRef.current = []
    scRef.current = 0
    speedRef.current = 140
    liveRef.current = true
    pausedRef.current = false
    partsRef.current = []
    lastRef.current = 0
    setScore(0)
    phaseRef.current = 'playing'
    setPhase('playing')
    rafRef.current = requestAnimationFrame(gameLoop)
  }, [gameLoop])

  const togglePause = useCallback(() => {
    if (!liveRef.current) return
    pausedRef.current = !pausedRef.current
    if (!pausedRef.current) rafRef.current = requestAnimationFrame(gameLoop)
    const p = pausedRef.current ? 'paused' : 'playing'
    phaseRef.current = p
    setPhase(p)
  }, [gameLoop])

  useEffect(() => {
    const DIR: Record<string, Dir> = {
      ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
      KeyW: 'UP', KeyS: 'DOWN', KeyA: 'LEFT', KeyD: 'RIGHT',
    }
    const onKey = (e: KeyboardEvent) => {
      const d = DIR[e.code]
      if (d) { e.preventDefault(); queueRef.current.push(d); return }
      if (e.code === 'Space') {
        e.preventDefault()
        if (phaseRef.current === 'idle' || phaseRef.current === 'over') startGame()
        else togglePause()
      }
      if (e.code === 'Escape') togglePause()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [startGame, togglePause])

  useEffect(() => {
    let tx = 0, ty = 0
    const s = (e: TouchEvent) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY }
    const e = (ev: TouchEvent) => {
      const dx = ev.changedTouches[0].clientX - tx
      const dy = ev.changedTouches[0].clientY - ty
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
        if (phaseRef.current === 'idle' || phaseRef.current === 'over') startGame()
        else togglePause()
        return
      }
      if (Math.abs(dx) > Math.abs(dy)) queueRef.current.push(dx > 0 ? 'RIGHT' : 'LEFT')
      else queueRef.current.push(dy > 0 ? 'DOWN' : 'UP')
    }
    window.addEventListener('touchstart', s)
    window.addEventListener('touchend', e)
    return () => { window.removeEventListener('touchstart', s); window.removeEventListener('touchend', e) }
  }, [startGame, togglePause])

  useEffect(() => {
    if (phase !== 'playing') {
      draw()
      const id = setInterval(draw, 33)
      return () => clearInterval(id)
    }
  }, [phase, draw])

  return (
    <div style={{ fontFamily: FONTS.ui, background: COLORS.bg }} className="min-h-screen flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-8 text-sm tracking-widest uppercase" style={{ color: COLORS.scoreText }}>
          <span>Score <strong style={{ color: COLORS.accent }}>{score}</strong></span>
          <span>Best <strong style={{ color: COLORS.accent }}>{hs}</strong></span>
          {phase === 'playing' && (
            <button onClick={togglePause} className="opacity-60 hover:opacity-100 transition-opacity">⏸</button>
          )}
        </div>

        <div className="relative">
          <canvas
            ref={canvas} width={SIZE} height={SIZE}
            style={{ display: 'block', borderRadius: 10, border: \`2px solid \${COLORS.border}\`, touchAction: 'none' }}
          />

          {(phase === 'idle' || phase === 'over') && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 rounded-xl"
              style={{ background: COLORS.overlay }}>
              <div className="text-center">
                <h1 className="text-5xl font-black tracking-tight uppercase"
                  style={{ fontFamily: FONTS.display, color: COLORS.accent, textShadow: \`0 0 40px \${COLORS.accent}88\` }}>
                  {TITLE}
                </h1>
                <p className="text-sm mt-1 tracking-widest" style={{ color: COLORS.scoreText }}>
                  {phase === 'over'
                    ? (score > 0 ? \`Score: \${score}\${score === hs && score > 0 ? ' · New Best!' : ''}\` : 'Game Over')
                    : SUBTITLE}
                </p>
              </div>
              <button onClick={startGame}
                className="px-10 py-3 rounded-xl font-bold uppercase tracking-widest text-sm transition-all hover:scale-105 active:scale-95"
                style={{ background: COLORS.accent, color: COLORS.buttonText, fontFamily: FONTS.display,
                  boxShadow: \`0 0 24px \${COLORS.accent}66\` }}>
                {phase === 'over' ? 'Play Again' : 'Play'}
              </button>
              {phase === 'idle' && (
                <p className="text-xs text-center opacity-50" style={{ color: COLORS.scoreText }}>
                  Arrow keys / WASD · Space to pause · Swipe on mobile
                </p>
              )}
            </div>
          )}

          {phase === 'paused' && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl"
              style={{ background: COLORS.overlay }}>
              <div className="text-center">
                <p className="text-4xl font-black tracking-widest"
                  style={{ fontFamily: FONTS.display, color: COLORS.accent }}>PAUSED</p>
                <p className="text-xs mt-2 opacity-50" style={{ color: COLORS.scoreText }}>
                  Space / Escape to resume
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
`.trim()

const THEME_TS = `
// PERSONALITY FILE — AI writes this to match the user's request.
// All visual identity lives here. Game logic in App.tsx never changes.

export const TITLE = 'SNAKE'
export const SUBTITLE = 'Classic Arcade'

/** Grid dimensions — keep GRID * CELL ≤ 600 for good mobile fit */
export const GRID = 20   // cells wide and tall
export const CELL = 24   // pixels per cell

export const COLORS = {
  bg:         '#0F172A',
  grid:       '#1E293B',
  snake:      '#0EA5E9',
  snakeHead:  '#38BDF8',
  food:       '#F43F5E',
  border:     '#1E40AF',
  overlay:    'rgba(15,23,42,0.92)',
  accent:     '#38BDF8',
  scoreText:  '#94A3B8',
  buttonText: '#0F172A',
}

export const FONTS = {
  display: "'Orbitron', monospace",
  ui:      "'Rajdhani', sans-serif",
}
`.trim()

const INDEX_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Rajdhani:wght@400;500;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#0F172A;overflow:hidden}
`.trim()

const MAIN_TSX = `
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
`.trim()

const INDEX_HTML = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Snake</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`.trim()

export const snakeTemplate: Template = {
  id: 'game-snake',
  name: 'Snake Game',
  skill: 'game',
  scaffoldFiles: [
    { path: 'index.html',    content: INDEX_HTML },
    { path: 'src/main.tsx',  content: MAIN_TSX  },
    { path: 'src/App.tsx',   content: APP_TSX   },
    { path: 'src/index.css', content: INDEX_CSS },
  ],
  personalityFiles: ['src/theme.ts'],
  instruction:
    'Snake game scaffold is pre-loaded (App.tsx, main.tsx, index.html, index.css). ' +
    'Write ONLY src/theme.ts — set TITLE, SUBTITLE, COLORS, and FONTS to match the brand. ' +
    'Do NOT modify or regenerate App.tsx or any other file. ' +
    'After writing theme.ts, run `pnpm install` then `pnpm dev`.',
}

export const defaultSnakeTheme = THEME_TS
