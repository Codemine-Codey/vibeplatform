/**
 * Post-generation code review gate.
 * Runs BEFORE the dev server starts — reads the main generated file and asks
 * DeepSeek Flash to spot common logic bugs (game mechanics, React anti-patterns).
 * Auto-repairs in-place using repairFile() if a critical bug is found.
 * Non-fatal: any failure skips silently so the pipeline is never blocked.
 */
import { generateText } from 'ai'
import { getModelOptions } from '@/ai/gateway'
import { DEFAULT_MODEL } from '@/ai/constants'
import { readSandboxFile, repairFile } from '@/lib/sandbox-util'
import type { Sandbox } from '@vercel/sandbox'

type Skill = 'website' | 'webapp' | 'game'

const GAME_REVIEW_PROMPT = `You are a game-logic bug detector. Review this game code for CRITICAL bugs that would cause a black/blank screen or a non-playable game. Check EVERY point:

1. RUNNING PROP BUG (most common): If using \`useGameLoop({ update, draw, running })\`, the \`running\` value MUST be a boolean like \`running={gameState === 'playing'}\`. If \`running\` is a string (e.g. \`running={gameState}\`), always-true (\`running={true}\`), or always-false (\`running={false}\`), the loop either never runs or runs in the wrong state. Find the exact value passed as \`running\`.

2. KEYBOARD LISTENERS STALE CLOSURE: If the game uses \`window.addEventListener('keydown', handler)\` inside a useEffect, the handler MUST include ALL game state in its dependency array OR use a ref pattern. A stale closure means keypresses don't change state. Pattern: \`const dirRef = useRef(direction); dirRef.current = direction;\` then read \`dirRef.current\` inside the listener.

3. DRAW COVERS ALL STATES: The \`draw()\` function must paint something in EVERY game state — Start/Idle, Playing, Paused, GameOver. If draw() has \`if (gameState !== 'playing') return\` or similar, the canvas is black except during gameplay. The start screen MUST be drawn on the canvas (or rendered as HTML elements over it).

4. RAF LOOP CLEANUP: If using requestAnimationFrame directly (not useGameLoop), the rAF ID MUST be stored in a ref and cancelled in useEffect cleanup. Otherwise a new loop starts on every render, causing ghost inputs and double-speed.

5. CLICK/SPACE TO START: There MUST be a visible start screen AND a clear input action (click, Space, Enter) that transitions gameState to 'playing'. If the game has no start screen or the transition is missing, the user sees the initial canvas state but can't start.

6. SNAKE REVERSAL: pressing the exact opposite direction (LEFT while going RIGHT) must be silently ignored, not allowed. Missing this breaks collision immediately.

7. INITIAL GAME STATE: The useState initializer for gameState MUST be 'start' (not 'playing', not 'idle'). If it's 'playing', the game starts immediately in playing mode with no start screen — the user sees the game mid-play with no way to begin intentionally. Check: \`useState<GameState>('start')\`.

8. RAF LOOP CONDITION: The useEffect that starts the RAF loop MUST have a guard at the top: \`if (gameState !== 'playing') return\`. If this guard is missing, the loop runs even in 'start' or 'gameover' state and can interfere with the start screen.

Look at the ACTUAL values in the code, not just the structure. Report the first critical bug found.
If no critical bugs: {"ok":true}
If a bug exists: {"ok":false,"issue":"one sentence describing the exact bug with the actual wrong value","fix":"corrected code — 5–20 lines showing the fix, not the whole file"}
Return raw JSON only — no markdown, no explanation outside the JSON.`

const WEBAPP_REVIEW_PROMPT = `You are a React webapp bug detector. Review this code for CRITICAL bugs that would cause the app to crash or be non-functional.

Check EVERY point:
1. DISALLOWED IMPORTS: only allowed imports are react, react-router-dom, lucide-react, @/components/ui/*, sonner, framer-motion, and built-in browser APIs. Any import from other src/ files (e.g. ../components/MyCard) will fail since those files don't exist yet.

2. INFINITE LOOPS: useEffect with setState inside where the setState'd value is also in the dependency array. Pattern: \`useEffect(() => { setX(y) }, [x])\` — if setX causes x to change, this loops forever.

3. UNDEFINED.MAP CRASH: calling .map(), .filter(), or .reduce() on a value that could be undefined. Any array from state that is initialized must be \`useState([])\` not \`useState(null)\` or \`useState(undefined)\`.

4. STATE MUTATION BUG (silent failure): using \`array.push(item)\` or \`array.splice()\` directly on a state array instead of \`setState([...array, item])\`. Mutation doesn't trigger re-render so the UI never updates.

5. ADD/CREATE ACTION BROKEN: find the primary "Add", "Save", "Submit", or "Create" button. Its onClick MUST call a setState setter with a new item added to the array. If onClick is undefined, empty, or calls a stub function like \`() => {}\`, the main feature doesn't work.

6. MISSING KEY PROP: map() rendering JSX elements without a unique key prop.

Look at ACTUAL values. Report the first critical bug found.
If no bugs: {"ok":true}
If a bug: {"ok":false,"issue":"one sentence with the specific wrong code","fix":"corrected code for just the broken section — not the whole file"}
Return raw JSON only — no markdown, no explanation.`

export async function reviewGeneratedCode(
  sandbox: Sandbox,
  skill: Skill,
): Promise<void> {
  // Websites use enrichment/Phase2 flow — different verification path
  if (skill === 'website') return

  const filePath = 'src/pages/Home.tsx'
  const reviewPrompt = skill === 'game' ? GAME_REVIEW_PROMPT : WEBAPP_REVIEW_PROMPT

  try {
    // Read the generated main file
    const content = await readSandboxFile(sandbox, filePath)
    if (!content || content.length < 200) return

    // Ask Flash to spot logic bugs — fast call, ~5s
    const { text } = await generateText({
      ...getModelOptions(DEFAULT_MODEL),
      maxOutputTokens: 1024,
      abortSignal: AbortSignal.timeout(20_000),
      messages: [{
        role: 'user',
        content: `${reviewPrompt}\n\n\`\`\`tsx\n${content.slice(0, 12000)}\n\`\`\``,
      }],
    })

    // Parse result — strip any accidental markdown fences
    const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const result = JSON.parse(cleaned) as { ok: boolean; issue?: string; fix?: string }

    if (result.ok === false && result.issue) {
      console.log(`[code-review] ${skill} bug detected: ${result.issue}`)
      // Use repairFile to get corrected full-file content
      const fixed = await repairFile(filePath, content, `Logic bug: ${result.issue}${result.fix ? `\n\nCorrect implementation:\n${result.fix}` : ''}`)
      if (fixed) {
        await sandbox.writeFiles([{ path: filePath, content: Buffer.from(fixed, 'utf8') }])
        console.log(`[code-review] auto-repaired ${filePath}`)
      }
    } else {
      console.log(`[code-review] ${skill} logic OK`)
    }
  } catch (err) {
    // Never block the pipeline
    console.warn('[code-review] skipped:', err instanceof Error ? err.message : String(err))
  }
}
