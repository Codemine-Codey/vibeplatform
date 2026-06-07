import type { Template } from './types'

const APP_TSX = /* tsx */ `
import { useEffect, useRef, useState, useCallback } from 'react'
import { TITLE, COLORS, FONTS } from './theme'

const W = 800, H = 500, PAD_W = 14, PAD_H = 90, PAD_SPEED = 6
const BALL_R = 10, WIN_SCORE = 7

type Phase = 'idle' | 'playing' | 'over'

let _actx: AudioContext | null = null
const beep = (hz: number, ms: number, vol = 0.08) => {
  try {
    if (!_actx) _actx = new AudioContext()
    const o = _actx.createOscillator(); const g = _actx.createGain()
    o.connect(g); g.connect(_actx.destination)
    o.type = 'square'; o.frequency.value = hz
    g.gain.setValueAtTime(vol, _actx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, _actx.currentTime + ms / 1000)
    o.start(); o.stop(_actx.currentTime + ms / 1000)
  } catch {}
}

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [scores, setScores] = useState([0, 0])
  const [winner, setWinner] = useState(0)

  const p1y = useRef(H / 2 - PAD_H / 2)
  const p2y = useRef(H / 2 - PAD_H / 2)
  const bx  = useRef(W / 2)
  const by  = useRef(H / 2)
  const bvx = useRef(5.5)
  const bvy = useRef(3.5)
  const sc  = useRef([0, 0])
  const keys = useRef<Record<string, boolean>>({})
  const liveRef = useRef(false)
  const rafRef  = useRef(0)
  const phaseRef = useRef<Phase>('idle')
  const particles = useRef<Array<{x:number;y:number;vx:number;vy:number;a:number}>>([])

  const draw = useCallback(() => {
    const cvs = canvas.current; if (!cvs) return
    const ctx = cvs.getContext('2d')!

    ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, W, H)

    // Center line
    ctx.setLineDash([12, 12])
    ctx.strokeStyle = COLORS.divider; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke()
    ctx.setLineDash([])

    // Scores
    ctx.font = \`bold 64px \${FONTS.display}\`
    ctx.textAlign = 'center'; ctx.globalAlpha = 0.4
    ctx.fillStyle = COLORS.accent; ctx.fillText(String(sc.current[0]), W / 4, 90)
    ctx.fillText(String(sc.current[1]), 3 * W / 4, 90)
    ctx.globalAlpha = 1; ctx.textAlign = 'left'

    // Paddles
    [p1y, p2y].forEach((py, i) => {
      const px = i === 0 ? 24 : W - 24 - PAD_W
      ctx.fillStyle = COLORS.paddle
      ctx.shadowBlur = 16; ctx.shadowColor = COLORS.paddle
      ctx.beginPath(); ctx.roundRect(px, py.current, PAD_W, PAD_H, 6); ctx.fill()
      ctx.shadowBlur = 0
    })

    // Ball glow
    ctx.fillStyle = COLORS.ball
    ctx.shadowBlur = 20; ctx.shadowColor = COLORS.ball
    ctx.beginPath(); ctx.arc(bx.current, by.current, BALL_R, 0, Math.PI * 2); ctx.fill()
    ctx.shadowBlur = 0

    // Trail particles
    particles.current = particles.current.filter(p => p.a > 0.02)
    particles.current.forEach(p => {
      ctx.globalAlpha = p.a; ctx.fillStyle = COLORS.ball
      ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill()
      p.x += p.vx; p.y += p.vy; p.a *= 0.85
    })
    ctx.globalAlpha = 1
  }, [])

  const reset = () => {
    bx.current = W / 2; by.current = H / 2
    const dir = Math.random() > 0.5 ? 1 : -1
    bvx.current = 5.5 * dir; bvy.current = (Math.random() * 3 + 2) * (Math.random() > 0.5 ? 1 : -1)
    p1y.current = H / 2 - PAD_H / 2; p2y.current = H / 2 - PAD_H / 2
  }

  const gameLoop = useCallback(() => {
    if (!liveRef.current) return

    // Player 1 (W/S)
    if (keys.current['KeyW'] && p1y.current > 0) p1y.current -= PAD_SPEED
    if (keys.current['KeyS'] && p1y.current < H - PAD_H) p1y.current += PAD_SPEED

    // Player 2 (arrows) or AI
    if (keys.current['ArrowUp'] && p2y.current > 0) p2y.current -= PAD_SPEED
    else if (keys.current['ArrowDown'] && p2y.current < H - PAD_H) p2y.current += PAD_SPEED
    else {
      // Simple AI
      const center = p2y.current + PAD_H / 2
      if (center < by.current - 10) p2y.current = Math.min(p2y.current + PAD_SPEED * 0.85, H - PAD_H)
      else if (center > by.current + 10) p2y.current = Math.max(p2y.current - PAD_SPEED * 0.85, 0)
    }

    // Ball movement
    bx.current += bvx.current
    by.current += bvy.current

    // Trail
    particles.current.push({ x: bx.current, y: by.current, vx: -bvx.current * 0.1, vy: 0, a: 0.6 })

    // Top/bottom bounce
    if (by.current - BALL_R <= 0) { by.current = BALL_R; bvy.current = Math.abs(bvy.current); beep(440, 40) }
    if (by.current + BALL_R >= H) { by.current = H - BALL_R; bvy.current = -Math.abs(bvy.current); beep(440, 40) }

    // Paddle collisions
    if (bx.current - BALL_R <= 24 + PAD_W && by.current > p1y.current && by.current < p1y.current + PAD_H && bvx.current < 0) {
      bvx.current = Math.abs(bvx.current) * 1.05
      bvy.current += ((by.current - (p1y.current + PAD_H / 2)) / (PAD_H / 2)) * 3
      bvy.current = Math.max(-8, Math.min(8, bvy.current))
      beep(660, 40)
    }
    if (bx.current + BALL_R >= W - 24 - PAD_W && by.current > p2y.current && by.current < p2y.current + PAD_H && bvx.current > 0) {
      bvx.current = -Math.abs(bvx.current) * 1.05
      bvy.current += ((by.current - (p2y.current + PAD_H / 2)) / (PAD_H / 2)) * 3
      bvy.current = Math.max(-8, Math.min(8, bvy.current))
      beep(660, 40)
    }

    // Clamp speed
    const spd = Math.hypot(bvx.current, bvy.current)
    if (spd > 14) { bvx.current = bvx.current / spd * 14; bvy.current = bvy.current / spd * 14 }

    // Score
    if (bx.current < 0) {
      sc.current[1]++; setScores([...sc.current]); beep(200, 150, 0.1)
      if (sc.current[1] >= WIN_SCORE) { liveRef.current = false; cancelAnimationFrame(rafRef.current); setWinner(2); phaseRef.current = 'over'; setPhase('over'); return }
      reset()
    }
    if (bx.current > W) {
      sc.current[0]++; setScores([...sc.current]); beep(200, 150, 0.1)
      if (sc.current[0] >= WIN_SCORE) { liveRef.current = false; cancelAnimationFrame(rafRef.current); setWinner(1); phaseRef.current = 'over'; setPhase('over'); return }
      reset()
    }

    draw()
    rafRef.current = requestAnimationFrame(gameLoop)
  }, [draw])

  const startGame = useCallback(() => {
    sc.current = [0, 0]; setScores([0, 0]); setWinner(0)
    reset(); liveRef.current = true
    phaseRef.current = 'playing'; setPhase('playing')
    rafRef.current = requestAnimationFrame(gameLoop)
  }, [gameLoop])

  useEffect(() => {
    const d = (e: KeyboardEvent) => { keys.current[e.code] = true; if (e.code === 'Space') { e.preventDefault(); if (phaseRef.current !== 'playing') startGame() } }
    const u = (e: KeyboardEvent) => { keys.current[e.code] = false }
    window.addEventListener('keydown', d); window.addEventListener('keyup', u)
    return () => { window.removeEventListener('keydown', d); window.removeEventListener('keyup', u) }
  }, [startGame])

  useEffect(() => { if (phase !== 'playing') { draw() } }, [phase, draw])

  return (
    <div style={{ fontFamily: FONTS.ui, background: COLORS.bg }} className="min-h-screen flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-4">
        <h2 className="text-xs tracking-widest uppercase opacity-50" style={{ color: COLORS.accent, fontFamily: FONTS.display }}>
          W/S · ↑/↓ or AI
        </h2>
        <div className="relative">
          <canvas ref={canvas} width={W} height={H}
            style={{ display: 'block', borderRadius: 12, border: \`2px solid \${COLORS.divider}\`,
              boxShadow: \`0 0 60px \${COLORS.ball}33\` }} />
          {(phase === 'idle' || phase === 'over') && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 rounded-xl"
              style={{ background: COLORS.overlay }}>
              <h1 className="text-6xl font-black tracking-widest uppercase"
                style={{ fontFamily: FONTS.display, color: COLORS.accent, textShadow: \`0 0 40px \${COLORS.accent}66\` }}>
                {phase === 'over' ? (winner === 1 ? 'P1 WINS!' : 'P2 WINS!') : TITLE}
              </h1>
              <button onClick={startGame}
                className="px-12 py-3 rounded-xl font-bold uppercase tracking-widest text-sm transition-all hover:scale-105"
                style={{ background: COLORS.accent, color: COLORS.bg, fontFamily: FONTS.display }}>
                {phase === 'over' ? 'Play Again' : 'Play'}
              </button>
              <p className="text-xs opacity-40" style={{ color: COLORS.accent }}>
                P1: W/S · P2: ↑/↓ or AI auto-plays · First to {WIN_SCORE}
              </p>
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

export const TITLE = 'PONG'

export const COLORS = {
  bg:      '#030712',
  paddle:  '#6366F1',
  ball:    '#A5F3FC',
  divider: '#1F2937',
  overlay: 'rgba(3,7,18,0.92)',
  accent:  '#6366F1',
}

export const FONTS = {
  display: "'Orbitron', monospace",
  ui:      "'Inter', sans-serif",
}
`.trim()

const INDEX_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Inter:wght@400;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#030712;overflow:hidden}
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
    <title>Pong</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`.trim()

export const pongTemplate: Template = {
  id: 'game-pong',
  name: 'Pong Game',
  skill: 'game',
  scaffoldFiles: [
    { path: 'index.html',    content: INDEX_HTML },
    { path: 'src/main.tsx',  content: MAIN_TSX  },
    { path: 'src/App.tsx',   content: APP_TSX   },
    { path: 'src/index.css', content: INDEX_CSS },
  ],
  personalityFiles: ['src/theme.ts'],
  instruction:
    'Pong engine pre-loaded (2-player + AI, physics, score to 7 — DO NOT regenerate). ' +
    'Write ONLY src/theme.ts. TITLE = brand name from brief. ' +
    'Derive bg, paddle, ball, accent from brief colorPalette. FONTS from fontPairing. Override every default.',
}

export const defaultPongTheme = THEME_TS
