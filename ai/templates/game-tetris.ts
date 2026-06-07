import type { Template } from './types'

const APP_TSX = /* tsx */ `
import { useEffect, useRef, useState, useCallback } from 'react'
import { TITLE, COLORS, FONTS } from './theme'

// Board: 10 cols × 20 rows, 30px cells
const COLS = 10, ROWS = 20, SZ = 30
const PREVIEW_SZ = 24

type Phase = 'idle' | 'playing' | 'paused' | 'over'
type Board = (string | null)[][]
type Piece = { shape: number[][]; color: string }

const PIECES: Piece[] = [
  { shape: [[1,1,1,1]],                          color: COLORS.pieces[0] },
  { shape: [[1,1],[1,1]],                        color: COLORS.pieces[1] },
  { shape: [[0,1,0],[1,1,1]],                    color: COLORS.pieces[2] },
  { shape: [[1,0,0],[1,1,1]],                    color: COLORS.pieces[3] },
  { shape: [[0,0,1],[1,1,1]],                    color: COLORS.pieces[4] },
  { shape: [[0,1,1],[1,1,0]],                    color: COLORS.pieces[5] },
  { shape: [[1,1,0],[0,1,1]],                    color: COLORS.pieces[6] },
]

let _actx: AudioContext | null = null
const beep = (hz: number, ms: number, type: OscillatorType = 'square', vol = 0.06) => {
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

const emptyBoard = (): Board => Array.from({ length: ROWS }, () => Array(COLS).fill(null))
const randPiece = () => ({ ...PIECES[Math.floor(Math.random() * PIECES.length)] })

const rotate = (shape: number[][]): number[][] => {
  const R = shape.length, C = shape[0].length
  return Array.from({ length: C }, (_, c) => Array.from({ length: R }, (_, r) => shape[R - 1 - r][c]))
}

const fits = (board: Board, shape: number[][], x: number, y: number): boolean => {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue
      const nr = y + r, nc = x + c
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return false
      if (board[nr][nc]) return false
    }
  }
  return true
}

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const preview = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [lines, setLines] = useState(0)
  const [hs, setHs] = useState(() => +(localStorage.getItem('cm_hs_tetris') || 0))

  const board    = useRef<Board>(emptyBoard())
  const cur      = useRef<Piece>(randPiece())
  const next     = useRef<Piece>(randPiece())
  const cx       = useRef(3)
  const cy       = useRef(0)
  const liveRef  = useRef(false)
  const pauseRef = useRef(false)
  const scRef    = useRef(0)
  const lvlRef   = useRef(1)
  const lnsRef   = useRef(0)
  const lastRef  = useRef(0)
  const rafRef   = useRef(0)
  const phaseRef = useRef<Phase>('idle')
  const clearAnim = useRef<number[]>([])
  const clearTimer = useRef(0)

  const dropInterval = () => Math.max(80, 800 - (lvlRef.current - 1) * 70)

  const drawBoard = useCallback(() => {
    const cvs = canvas.current; if (!cvs) return
    const ctx = cvs.getContext('2d')!
    ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, COLS * SZ, ROWS * SZ)

    // Grid lines
    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 0.4
    for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * SZ); ctx.lineTo(COLS * SZ, r * SZ); ctx.stroke() }
    for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(c * SZ, 0); ctx.lineTo(c * SZ, ROWS * SZ); ctx.stroke() }

    // Board cells
    board.current.forEach((row, r) => row.forEach((cell, c) => {
      if (!cell) return
      const flash = clearAnim.current.includes(r)
      ctx.fillStyle = flash ? '#ffffff' : cell
      if (!flash) { ctx.shadowBlur = 6; ctx.shadowColor = cell }
      ctx.fillRect(c * SZ + 1, r * SZ + 1, SZ - 2, SZ - 2)
      ctx.shadowBlur = 0
    }))

    const piece = cur.current
    const px = cx.current, py = cy.current

    // Ghost piece
    let gy = py
    while (fits(board.current, piece.shape, px, gy + 1)) gy++
    ctx.globalAlpha = 0.2
    piece.shape.forEach((row, r) => row.forEach((v, c) => {
      if (!v) return
      ctx.fillStyle = piece.color
      ctx.fillRect((px + c) * SZ + 1, (gy + r) * SZ + 1, SZ - 2, SZ - 2)
    }))
    ctx.globalAlpha = 1

    // Active piece
    piece.shape.forEach((row, r) => row.forEach((v, c) => {
      if (!v) return
      ctx.fillStyle = piece.color
      ctx.shadowBlur = 8; ctx.shadowColor = piece.color
      ctx.fillRect((px + c) * SZ + 1, (py + r) * SZ + 1, SZ - 2, SZ - 2)
      ctx.shadowBlur = 0
    }))
  }, [])

  const drawPreview = useCallback(() => {
    const cvs = preview.current; if (!cvs) return
    const ctx = cvs.getContext('2d')!
    const P = PREVIEW_SZ, W = 4 * P, H = 4 * P
    ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, W, H)
    const n = next.current
    const offX = Math.floor((4 - n.shape[0].length) / 2)
    const offY = Math.floor((4 - n.shape.length) / 2)
    n.shape.forEach((row, r) => row.forEach((v, c) => {
      if (!v) return
      ctx.fillStyle = n.color
      ctx.shadowBlur = 6; ctx.shadowColor = n.color
      ctx.fillRect((offX + c) * P + 1, (offY + r) * P + 1, P - 2, P - 2)
      ctx.shadowBlur = 0
    }))
  }, [])

  const lock = useCallback(() => {
    const piece = cur.current
    piece.shape.forEach((row, r) => row.forEach((v, c) => {
      if (!v) return
      const nr = cy.current + r, nc = cx.current + c
      if (nr >= 0) board.current[nr][nc] = piece.color
    }))

    // Find cleared lines
    const cleared: number[] = []
    board.current.forEach((row, r) => { if (row.every(c => c !== null)) cleared.push(r) })

    if (cleared.length) {
      clearAnim.current = cleared
      beep(880, 80, 'sine', 0.1)
      clearTimer.current = window.setTimeout(() => {
        const newBoard = board.current.filter((_, r) => !cleared.includes(r))
        while (newBoard.length < ROWS) newBoard.unshift(Array(COLS).fill(null))
        board.current = newBoard
        clearAnim.current = []
        const pts = [0, 100, 300, 500, 800][cleared.length] * lvlRef.current
        scRef.current += pts
        lnsRef.current += cleared.length
        const newLvl = Math.floor(lnsRef.current / 10) + 1
        lvlRef.current = newLvl
        setScore(scRef.current); setLines(lnsRef.current); setLevel(newLvl)
        spawnNext()
      }, 150)
    } else {
      spawnNext()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const spawnNext = useCallback(() => {
    cur.current = next.current
    next.current = randPiece()
    cx.current = Math.floor((COLS - cur.current.shape[0].length) / 2)
    cy.current = 0
    drawPreview()
    if (!fits(board.current, cur.current.shape, cx.current, cy.current)) {
      liveRef.current = false
      cancelAnimationFrame(rafRef.current)
      beep(200, 200, 'sawtooth', 0.1)
      const final = scRef.current
      setHs(prev => { const n = Math.max(prev, final); localStorage.setItem('cm_hs_tetris', String(n)); return n })
      phaseRef.current = 'over'; setPhase('over')
    }
  }, [drawPreview])

  const drop = useCallback(() => {
    if (fits(board.current, cur.current.shape, cx.current, cy.current + 1)) {
      cy.current++
    } else {
      beep(220, 40, 'square', 0.05)
      lock()
    }
  }, [lock])

  const gameLoop = useCallback((ts: number) => {
    if (!liveRef.current || pauseRef.current) return
    drawBoard()
    if (ts - lastRef.current >= dropInterval()) { lastRef.current = ts; drop() }
    rafRef.current = requestAnimationFrame(gameLoop)
  }, [drawBoard, drop]) // eslint-disable-line react-hooks/exhaustive-deps

  const startGame = useCallback(() => {
    board.current = emptyBoard()
    cur.current = randPiece()
    next.current = randPiece()
    cx.current = Math.floor((COLS - cur.current.shape[0].length) / 2)
    cy.current = 0; scRef.current = 0; lvlRef.current = 1; lnsRef.current = 0
    liveRef.current = true; pauseRef.current = false
    lastRef.current = 0
    setScore(0); setLevel(1); setLines(0)
    phaseRef.current = 'playing'; setPhase('playing')
    drawPreview()
    rafRef.current = requestAnimationFrame(gameLoop)
  }, [gameLoop, drawPreview])

  const togglePause = useCallback(() => {
    if (!liveRef.current) return
    pauseRef.current = !pauseRef.current
    if (!pauseRef.current) rafRef.current = requestAnimationFrame(gameLoop)
    const p = pauseRef.current ? 'paused' : 'playing'
    phaseRef.current = p; setPhase(p)
  }, [gameLoop])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!liveRef.current || pauseRef.current) {
        if (e.code === 'Space') { e.preventDefault(); if (phaseRef.current === 'idle' || phaseRef.current === 'over') startGame(); else togglePause() }
        return
      }
      switch (e.code) {
        case 'ArrowLeft':  e.preventDefault(); if (fits(board.current, cur.current.shape, cx.current - 1, cy.current)) cx.current--; break
        case 'ArrowRight': e.preventDefault(); if (fits(board.current, cur.current.shape, cx.current + 1, cy.current)) cx.current++; break
        case 'ArrowDown':  e.preventDefault(); drop(); break
        case 'ArrowUp': case 'KeyX': {
          e.preventDefault()
          const r = rotate(cur.current.shape)
          if (fits(board.current, r, cx.current, cy.current)) cur.current = { ...cur.current, shape: r }
          break
        }
        case 'Space': {
          e.preventDefault()
          while (fits(board.current, cur.current.shape, cx.current, cy.current + 1)) cy.current++
          lock(); break
        }
        case 'Escape': e.preventDefault(); togglePause(); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [startGame, togglePause, drop, lock])

  useEffect(() => {
    if (phase !== 'playing') { drawBoard(); drawPreview() }
  }, [phase, drawBoard, drawPreview])

  const boardW = COLS * SZ, boardH = ROWS * SZ

  return (
    <div style={{ fontFamily: FONTS.ui, background: COLORS.bg }} className="min-h-screen flex items-center justify-center p-4">
      <div className="flex gap-6 items-start">
        {/* Game board */}
        <div className="relative">
          <canvas ref={canvas} width={boardW} height={boardH}
            style={{ display: 'block', borderRadius: 8, border: \`2px solid \${COLORS.border}\` }} />
          {(phase === 'idle' || phase === 'over') && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 rounded-lg"
              style={{ background: COLORS.overlay }}>
              <h1 className="text-5xl font-black tracking-tight uppercase"
                style={{ fontFamily: FONTS.display, color: COLORS.accent, textShadow: \`0 0 40px \${COLORS.accent}88\` }}>
                {TITLE}
              </h1>
              {phase === 'over' && (
                <p style={{ color: COLORS.scoreText }} className="text-sm tracking-widest">
                  Score: {score}{score === hs && score > 0 ? ' · New Best!' : ''}
                </p>
              )}
              <button onClick={startGame}
                className="px-10 py-3 rounded-xl font-bold uppercase tracking-widest text-sm transition-all hover:scale-105"
                style={{ background: COLORS.accent, color: COLORS.buttonText, fontFamily: FONTS.display,
                  boxShadow: \`0 0 24px \${COLORS.accent}66\` }}>
                {phase === 'over' ? 'Play Again' : 'Play'}
              </button>
              <p className="text-xs opacity-40" style={{ color: COLORS.scoreText }}>Arrow keys · Space = hard drop</p>
            </div>
          )}
          {phase === 'paused' && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg" style={{ background: COLORS.overlay }}>
              <p className="text-4xl font-black tracking-widest" style={{ fontFamily: FONTS.display, color: COLORS.accent }}>PAUSED</p>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-4 min-w-[120px]">
          <div style={{ border: \`1px solid \${COLORS.border}\`, borderRadius: 8, padding: 12 }}>
            <p className="text-xs tracking-widest uppercase mb-2" style={{ color: COLORS.scoreText }}>Next</p>
            <canvas ref={preview} width={4 * PREVIEW_SZ} height={4 * PREVIEW_SZ} style={{ display: 'block' }} />
          </div>
          {[['Score', score], ['Level', level], ['Lines', lines], ['Best', hs]].map(([label, val]) => (
            <div key={String(label)} style={{ border: \`1px solid \${COLORS.border}\`, borderRadius: 8, padding: '8px 12px' }}>
              <p className="text-xs tracking-widest uppercase" style={{ color: COLORS.scoreText }}>{label}</p>
              <p className="text-xl font-bold" style={{ color: COLORS.accent, fontFamily: FONTS.display }}>{val}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
`.trim()

const THEME_TS = `
// PERSONALITY FILE — AI writes this to match the user's request.

export const TITLE = 'TETRIS'

export const COLORS = {
  bg:         '#0D0D1A',
  grid:       '#1A1A2E',
  border:     '#2D2D5E',
  overlay:    'rgba(13,13,26,0.93)',
  accent:     '#A78BFA',
  scoreText:  '#8892B0',
  buttonText: '#0D0D1A',
  pieces: [
    '#22D3EE',  // I - cyan
    '#FBBF24',  // O - yellow
    '#A78BFA',  // T - purple
    '#F97316',  // J - orange
    '#3B82F6',  // L - blue
    '#4ADE80',  // S - green
    '#F43F5E',  // Z - red
  ],
}

export const FONTS = {
  display: "'Orbitron', monospace",
  ui:      "'Rajdhani', sans-serif",
}
`.trim()

const INDEX_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Rajdhani:wght@400;500;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#0D0D1A;overflow:hidden}
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
    <title>Tetris</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`.trim()

export const tetrisTemplate: Template = {
  id: 'game-tetris',
  name: 'Tetris Game',
  skill: 'game',
  scaffoldFiles: [
    { path: 'index.html',    content: INDEX_HTML },
    { path: 'src/main.tsx',  content: MAIN_TSX  },
    { path: 'src/App.tsx',   content: APP_TSX   },
    { path: 'src/index.css', content: INDEX_CSS },
  ],
  personalityFiles: ['src/theme.ts'],
  instruction:
    'Tetris engine pre-loaded (ghost piece, line clear, levels — DO NOT regenerate). ' +
    'Write ONLY src/theme.ts. TITLE = brand name from brief. ' +
    'COLORS.pieces = 7 colors derived from the brief palette (vary shades/tints of the brand colors). ' +
    'bg/border/accent from brief colorPalette. FONTS from brief fontPairing. Override every default.',
}

export const defaultTetrisTheme = THEME_TS
