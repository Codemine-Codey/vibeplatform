# Game Skill Pack — Design & Code Patterns

## State Machine (Required)
Every game MUST use this state machine — no exceptions:
```ts
type GameState = 'start' | 'playing' | 'paused' | 'gameover'
const [gameState, setGameState] = useState<GameState>('start')
```
All rendering and logic branches off this. Never use boolean flags like `isPlaying`, `isDead`.

## Game Loop Pattern (Canvas Games)
```ts
const canvasRef = useRef<HTMLCanvasElement>(null)
const stateRef = useRef<GameData>(initialState)  // ALL game data in refs — no useState in loop
const rafRef = useRef<number>(0)

useEffect(() => {
  if (gameState !== 'playing') return
  const canvas = canvasRef.current!
  const ctx = canvas.getContext('2d')!

  const loop = (timestamp: number) => {
    update(stateRef.current, timestamp)   // mutate ref directly
    render(ctx, stateRef.current)         // draw from ref
    rafRef.current = requestAnimationFrame(loop)
  }
  rafRef.current = requestAnimationFrame(loop)
  return () => cancelAnimationFrame(rafRef.current)
}, [gameState])   // restart loop on state change only
```

**Rule:** Never call `setState` inside the game loop. Only call `setGameState` when transitioning (player dies → 'gameover'). All in-loop data (position, velocity, score) lives in refs.

## Input Handling
```ts
useEffect(() => {
  const keys = new Set<string>()
  const onDown = (e: KeyboardEvent) => { keys.add(e.code); e.preventDefault() }
  const onUp = (e: KeyboardEvent) => keys.delete(e.code)
  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
}, [])

// In game loop — check keys Set, not event listeners
if (keys.has('Space') || keys.has('ArrowUp')) player.jump()
```
Always add touch controls alongside keyboard for mobile playability.

## Game Constants (Always Define at Top)
```ts
const GRAVITY = 0.5
const PLAYER_SPEED = 4
const JUMP_FORCE = -12
const ENEMY_SPEED = 2
const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 450
const FPS_CAP = 60
```
Never hardcode numbers inside game logic. All tuning values are constants.

## Collision Detection (AABB)
```ts
function collides(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y
}
```

## Color & Visual Design
- Dark backgrounds: `#0a0a0a`, `#111827`, deep navy, dark purple — never light gray
- Accent colors: vibrant, high contrast — neon green `#39ff14`, electric blue `#00d4ff`, hot pink `#ff006e`
- HUD text: white or near-white, `font-mono`, high contrast
- Particle effects on hits/death: colored squares or circles, random velocity, fade out over 30 frames
- Pixel art style: disable anti-aliasing (`ctx.imageSmoothingEnabled = false`), use crisp shapes

## Screen Templates

**Start Screen:**
```jsx
<div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0a] text-white">
  <h1 className="text-7xl font-black mb-4 tracking-tight" style={{color: accentColor}}>{gameName}</h1>
  <p className="text-lg text-white/50 mb-12">{tagline}</p>
  {highScore > 0 && <p className="text-sm text-white/40 mb-8 font-mono">Best: {highScore}</p>}
  <button onClick={() => setGameState('playing')}
    className="px-12 py-4 rounded-full text-black font-bold text-lg animate-pulse"
    style={{backgroundColor: accentColor}}>
    PLAY
  </button>
  <p className="text-xs text-white/30 mt-6">SPACE / ENTER to start · Arrow keys to move</p>
</div>
```

**HUD (over canvas):**
```jsx
<div className="absolute inset-0 pointer-events-none font-mono">
  <div className="absolute top-4 left-4 text-white text-lg font-bold">{score}</div>
  <div className="absolute top-4 right-4 text-white/50 text-sm">Best: {highScore}</div>
  {lives && <div className="absolute top-4 left-1/2 -translate-x-1/2">{'♥'.repeat(lives)}</div>}
  <button onClick={() => setGameState('paused')}
    className="absolute top-4 right-16 text-white/40 pointer-events-auto">⏸</button>
</div>
```

**Game Over Overlay:**
```jsx
{gameState === 'gameover' && (
  <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center">
    <h2 className="text-5xl font-black text-white mb-2">GAME OVER</h2>
    <p className="text-4xl font-mono text-accent mb-1">{score}</p>
    {score >= highScore && <p className="text-sm text-yellow-400 mb-8">NEW BEST!</p>}
    <button onClick={restart} className="px-10 py-3 bg-white text-black font-bold rounded-full">
      PLAY AGAIN
    </button>
  </div>
)}
```

## Canvas vs DOM
- **Use canvas** for: physics-based games, particle systems, tile maps, anything with 50+ moving objects
- **Use DOM/React** for: card games, board games, word games, quiz games, turn-based — simpler and better looking

## Score & High Score
```ts
const [score, setScore] = useState(0)
const [highScore, setHighScore] = useState(() => parseInt(localStorage.getItem('highScore') ?? '0'))

const endGame = () => {
  if (score > highScore) {
    setHighScore(score)
    localStorage.setItem('highScore', String(score))
  }
  setGameState('gameover')
}
```

## Mobile / Touch Controls
For any game: add on-screen buttons for mobile. Position absolutely over canvas:
```jsx
<div className="absolute bottom-8 left-0 right-0 flex justify-between px-8 pointer-events-none md:hidden">
  <button onTouchStart={() => input.left = true} onTouchEnd={() => input.left = false}
    className="w-16 h-16 rounded-full bg-white/20 pointer-events-auto text-2xl">←</button>
  <button onTouchStart={jump}
    className="w-16 h-16 rounded-full bg-white/20 pointer-events-auto text-2xl">↑</button>
  <button onTouchStart={() => input.right = true} onTouchEnd={() => input.right = false}
    className="w-16 h-16 rounded-full bg-white/20 pointer-events-auto text-2xl">→</button>
</div>
```

## Anti-Patterns to Avoid
- Never use `setInterval` for game loop — use `requestAnimationFrame`
- Never store fast-changing game data (position, velocity) in React state — use refs
- Never re-render the whole React tree on every frame
- Never forget `cancelAnimationFrame` cleanup in useEffect
- Never ship without a restart mechanism
- Never let the game loop run when `gameState !== 'playing'`
