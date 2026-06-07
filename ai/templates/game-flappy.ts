import type { Template } from './types'

const APP_TSX = /* tsx */ `
import { useEffect, useRef, useState, useCallback } from 'react'
import { TITLE, COLORS, FONTS } from './theme'

const W = 400, H = 600
const GRAVITY = 0.45, JUMP = -8.5
const PIPE_W = 52, PIPE_GAP = 160, PIPE_SPEED = 2.8, PIPE_INTERVAL = 1600
const BIRD_X = 90, BIRD_R = 16

type Phase = 'idle' | 'playing' | 'over'

let _actx: AudioContext | null = null
const beep = (hz: number, ms: number, type: OscillatorType = 'sine', vol = 0.07) => {
  try {
    if (!_actx) _actx = new AudioContext()
    const o = _actx.createOscillator(); const g = _actx.createGain()
    o.connect(g); g.connect(_actx.destination)
    o.type = type; o.frequency.value = hz
    g.gain.setValueAtTime(vol, _actx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, _actx.currentTime + ms / 1000)
    o.start(); o.stop(_actx.currentTime + ms / 1000)
  } catch {}
}

type Pipe = { x: number; topH: number; scored: boolean }

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [score, setScore] = useState(0)
  const [hs, setHs] = useState(() => +(localStorage.getItem('cm_hs_flappy') || 0))

  const by     = useRef(H / 2)
  const bvy    = useRef(0)
  const bAngle = useRef(0)
  const pipes  = useRef<Pipe[]>([])
  const scRef  = useRef(0)
  const liveRef = useRef(false)
  const rafRef  = useRef(0)
  const lastPipe = useRef(0)
  const phaseRef = useRef<Phase>('idle')
  const bgX    = useRef(0)

  // Parallax cloud positions
  const clouds = useRef(
    Array.from({ length: 5 }, (_, i) => ({ x: i * 100, y: 60 + Math.random() * 80, w: 60 + Math.random() * 40 }))
  )

  const drawBird = (ctx: CanvasRenderingContext2D, y: number, angle: number) => {
    ctx.save()
    ctx.translate(BIRD_X, y)
    ctx.rotate(angle)
    // Body
    ctx.fillStyle = COLORS.bird
    ctx.shadowBlur = 14; ctx.shadowColor = COLORS.bird
    ctx.beginPath(); ctx.ellipse(0, 0, BIRD_R, BIRD_R - 3, 0, 0, Math.PI * 2); ctx.fill()
    ctx.shadowBlur = 0
    // Wing
    ctx.fillStyle = COLORS.birdWing
    ctx.beginPath(); ctx.ellipse(-4, 3, 8, 5, -0.3, 0, Math.PI * 2); ctx.fill()
    // Eye
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.arc(7, -4, 5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#1a1a2e'
    ctx.beginPath(); ctx.arc(8, -4, 2.5, 0, Math.PI * 2); ctx.fill()
    // Beak
    ctx.fillStyle = COLORS.beak
    ctx.beginPath(); ctx.moveTo(14, -1); ctx.lineTo(20, 1); ctx.lineTo(14, 3); ctx.closePath(); ctx.fill()
    ctx.restore()
  }

  const drawPipe = (ctx: CanvasRenderingContext2D, pipe: Pipe) => {
    const topY = pipe.topH, botY = topY + PIPE_GAP

    ctx.fillStyle = COLORS.pipe
    ctx.shadowBlur = 6; ctx.shadowColor = COLORS.pipe

    // Top pipe
    ctx.beginPath(); ctx.roundRect(pipe.x, 0, PIPE_W, topY - 8, [0, 0, 6, 6]); ctx.fill()
    ctx.fillRect(pipe.x - 4, topY - 18, PIPE_W + 8, 18)

    // Bottom pipe
    ctx.beginPath(); ctx.roundRect(pipe.x, botY + 8, PIPE_W, H - botY - 8, [6, 6, 0, 0]); ctx.fill()
    ctx.fillRect(pipe.x - 4, botY, PIPE_W + 8, 18)

    ctx.shadowBlur = 0
  }

  const draw = useCallback((ts: number) => {
    const cvs = canvas.current; if (!cvs) return
    const ctx = cvs.getContext('2d')!

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, COLORS.skyTop); sky.addColorStop(1, COLORS.skyBot)
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)

    // Parallax clouds
    bgX.current += 0.3
    clouds.current.forEach(c => {
      const x = (c.x - bgX.current * 0.5 + W * 2) % (W + c.w) - c.w
      ctx.fillStyle = COLORS.clouds; ctx.globalAlpha = 0.7
      ctx.beginPath(); ctx.ellipse(x, c.y, c.w / 2, 18, 0, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.ellipse(x + c.w / 3, c.y - 10, c.w / 3, 14, 0, 0, Math.PI * 2); ctx.fill()
    })
    ctx.globalAlpha = 1

    // Ground
    ctx.fillStyle = COLORS.ground; ctx.fillRect(0, H - 60, W, 60)
    ctx.fillStyle = COLORS.grass; ctx.fillRect(0, H - 62, W, 6)

    pipes.current.forEach(p => drawPipe(ctx, p))
    drawBird(ctx, by.current, bAngle.current)

    // Score
    ctx.font = \`bold 36px \${FONTS.display}\`
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'
    ctx.shadowBlur = 8; ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.fillText(String(scRef.current), W / 2, 60)
    ctx.shadowBlur = 0; ctx.textAlign = 'left'
  }, [])

  const endGame = useCallback(() => {
    liveRef.current = false
    cancelAnimationFrame(rafRef.current)
    beep(250, 120, 'sawtooth', 0.12)
    const final = scRef.current
    setHs(prev => { const n = Math.max(prev, final); localStorage.setItem('cm_hs_flappy', String(n)); return n })
    phaseRef.current = 'over'; setPhase('over')
  }, [])

  const gameLoop = useCallback((ts: number) => {
    if (!liveRef.current) return

    bvy.current += GRAVITY
    by.current += bvy.current
    bAngle.current = Math.min(Math.PI / 4, Math.max(-Math.PI / 6, bvy.current * 0.05))

    // Spawn pipes
    if (ts - lastPipe.current > PIPE_INTERVAL) {
      lastPipe.current = ts
      const topH = 80 + Math.random() * (H - PIPE_GAP - 140)
      pipes.current.push({ x: W + 20, topH, scored: false })
    }

    // Move pipes
    pipes.current.forEach(p => { p.x -= PIPE_SPEED })
    pipes.current = pipes.current.filter(p => p.x > -PIPE_W - 20)

    // Score
    pipes.current.forEach(p => {
      if (!p.scored && p.x + PIPE_W < BIRD_X) {
        p.scored = true; scRef.current++; setScore(scRef.current)
        beep(880, 50, 'sine', 0.08)
      }
    })

    // Collision
    if (by.current + BIRD_R > H - 60 || by.current - BIRD_R < 0) { endGame(); return }
    for (const p of pipes.current) {
      if (BIRD_X + BIRD_R - 6 > p.x && BIRD_X - BIRD_R + 6 < p.x + PIPE_W) {
        if (by.current - BIRD_R + 4 < p.topH || by.current + BIRD_R - 4 > p.topH + PIPE_GAP) { endGame(); return }
      }
    }

    draw(ts)
    rafRef.current = requestAnimationFrame(gameLoop)
  }, [draw, endGame])

  const jump = useCallback(() => {
    if (!liveRef.current) return
    bvy.current = JUMP
    beep(660, 60, 'sine', 0.06)
  }, [])

  const startGame = useCallback(() => {
    by.current = H / 2; bvy.current = 0; bAngle.current = 0
    pipes.current = []; scRef.current = 0; lastPipe.current = 0
    liveRef.current = true
    setScore(0)
    phaseRef.current = 'playing'; setPhase('playing')
    rafRef.current = requestAnimationFrame(gameLoop)
  }, [gameLoop])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault()
        if (phaseRef.current === 'idle' || phaseRef.current === 'over') startGame()
        else jump()
      }
    }
    const onTouch = () => {
      if (phaseRef.current === 'idle' || phaseRef.current === 'over') startGame()
      else jump()
    }
    const onClick = () => {
      if (phaseRef.current === 'idle' || phaseRef.current === 'over') startGame()
      else jump()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('touchstart', onTouch)
    canvas.current?.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('touchstart', onTouch)
    }
  }, [startGame, jump])

  useEffect(() => {
    if (phase !== 'playing') {
      const cvs = canvas.current; if (!cvs) return
      const ctx = cvs.getContext('2d')!
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, COLORS.skyTop); sky.addColorStop(1, COLORS.skyBot)
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = COLORS.ground; ctx.fillRect(0, H - 60, W, 60)
      ctx.fillStyle = COLORS.grass; ctx.fillRect(0, H - 62, W, 6)
      drawBird(ctx, by.current, 0)
    }
  }, [phase])

  return (
    <div style={{ fontFamily: FONTS.ui, background: COLORS.skyTop }} className="min-h-screen flex items-center justify-center">
      <div className="relative">
        <canvas ref={canvas} width={W} height={H}
          style={{ display: 'block', borderRadius: 12, cursor: 'pointer',
            boxShadow: \`0 0 60px \${COLORS.pipe}44\` }} />

        {(phase === 'idle' || phase === 'over') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 rounded-xl"
            style={{ background: 'rgba(0,0,0,0.55)' }}>
            <div className="text-center">
              <h1 className="text-5xl font-black tracking-tight drop-shadow-lg"
                style={{ fontFamily: FONTS.display, color: COLORS.bird,
                  textShadow: \`0 0 30px \${COLORS.bird}88, 0 2px 0 #0008\` }}>
                {TITLE}
              </h1>
              {phase === 'over' && (
                <p className="text-white text-sm mt-2 opacity-80">
                  Score: {score}{score > 0 && score === hs ? ' · New Best!' : ''}
                </p>
              )}
            </div>
            <button onClick={startGame}
              className="px-10 py-3 rounded-full font-bold uppercase tracking-widest text-sm transition-all hover:scale-105"
              style={{ background: COLORS.bird, color: COLORS.skyTop, fontFamily: FONTS.display,
                boxShadow: \`0 0 20px \${COLORS.bird}88\` }}>
              {phase === 'over' ? 'Play Again' : 'Tap / Space'}
            </button>
            {phase === 'idle' && (
              <p className="text-white text-xs opacity-50">Space / Tap to flap</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
`.trim()

const THEME_TS = `
// PERSONALITY FILE — AI writes this to match the user's request.

export const TITLE = 'FLAPPY'

export const COLORS = {
  skyTop:   '#1a1a2e',
  skyBot:   '#16213e',
  clouds:   'rgba(255,255,255,0.15)',
  ground:   '#2d4a22',
  grass:    '#4ade80',
  pipe:     '#4ade80',
  bird:     '#FBBF24',
  birdWing: '#F59E0B',
  beak:     '#F97316',
}

export const FONTS = {
  display: "'Bangers', cursive",
  ui:      "'Inter', sans-serif",
}
`.trim()

const INDEX_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bangers&family=Inter:wght@400;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#1a1a2e;overflow:hidden}
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
    <title>Flappy</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`.trim()

export const flappyTemplate: Template = {
  id: 'game-flappy',
  name: 'Flappy Bird Game',
  skill: 'game',
  scaffoldFiles: [
    { path: 'index.html',    content: INDEX_HTML },
    { path: 'src/main.tsx',  content: MAIN_TSX  },
    { path: 'src/App.tsx',   content: APP_TSX   },
    { path: 'src/index.css', content: INDEX_CSS },
  ],
  personalityFiles: ['src/theme.ts'],
  instruction:
    'Flappy Bird scaffold is pre-loaded (physics, parallax clouds, pipes, collision). ' +
    'Write ONLY src/theme.ts — set TITLE and COLORS (skyTop, skyBot, pipe, bird, etc.) and FONTS to match the theme. ' +
    'Do NOT touch App.tsx.',
}

export const defaultFlappyTheme = THEME_TS
