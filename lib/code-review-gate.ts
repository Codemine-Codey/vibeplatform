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

const GAME_REVIEW_PROMPT = `You are a game-logic bug detector. Review this game code for CRITICAL bugs that would cause a blank/blue screen or broken gameplay. Check specifically:

1. RUNNING PROP BUG (most common — causes blue screen after clicking Play): The \`useGameLoop({ update, draw, running })\` call MUST pass \`running={gameState === 'playing'}\` (or whatever the "active" state is called). If \`running\` is always true, always false, or is a string not a boolean, the canvas goes blank. Check the exact value passed as \`running\`.

2. DRAW COVERS ALL STATES: The \`draw()\` function must paint something in EVERY game state — Start, Playing, Paused, GameOver. If \`draw()\` only renders in "playing" state and returns early for others, the canvas is black/blue on Start and GameOver. Check all early returns in draw().

3. RAF LOOP CLEANUP: If using \`requestAnimationFrame\` manually (not via useGameLoop), the rAF id MUST be stored in a ref and cancelled in useEffect return — missing this causes a double loop on re-render (double speed, ghost inputs).

4. SNAKE FOOD SPAWN: must use \`do { food=randomCell() } while(occupied.has(key))\` with a Set of ALL occupied cells. Any other approach risks food spawning on the snake → game freezes.

5. REVERSAL PREVENTION: pressing the exact opposite direction (left while going right) must be silently ignored.

6. STATE TRANSITION BUG: Clicking "Play"/"Start" must actually change the game state variable AND ensure \`running\` flips to true on the SAME render cycle. If state update is async and \`running\` depends on it, the first frame may not fire.

If no critical bugs, return: {"ok":true}
If a critical bug exists, return the FIRST one found: {"ok":false,"issue":"one-line description of the exact bug","fix":"corrected code snippet for just the broken section — 5-20 lines max, not the whole file"}
Return raw JSON only — no markdown fences, no explanation outside the JSON.`

const WEBAPP_REVIEW_PROMPT = `You are a React bug detector. Review this webapp code for CRITICAL bugs only.
Check specifically:
1. DISALLOWED IMPORTS: only allowed imports are react, react-router-dom, lucide-react, @/components/ui/*, sonner, framer-motion. Any import from other src/ files (e.g. ../components/MyCard) will fail since those files don't exist yet.
2. INFINITE LOOPS: useEffect with setState where the setState value is also a dependency — causes infinite re-render.
3. MISSING KEY PROPS: map() rendering JSX elements without a key prop.
4. UNDEFINED ACCESS: accessing .map() or .filter() on a value that could be undefined without optional chaining.

If no bugs, return: {"ok":true}
If a critical bug exists, return: {"ok":false,"issue":"one-line description","fix":"corrected code for just the broken section — not the whole file"}
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
