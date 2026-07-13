/**
 * Post-generation code review gate.
 * Runs BEFORE the dev server starts — reads the main generated file and asks
 * DeepSeek Flash to spot ALL critical logic bugs in one pass.
 * Auto-repairs in-place using repairFile() with the full bug list.
 * Non-fatal: any failure skips silently so the pipeline is never blocked.
 */
import { generateText } from 'ai'
import { getModelOptions } from '@/ai/gateway'
import { DEFAULT_MODEL } from '@/ai/constants'
import { readSandboxFile, repairFile } from '@/lib/sandbox-util'
import type { Sandbox } from '@vercel/sandbox'

type Skill = 'website' | 'webapp' | 'game'

const GAME_REVIEW_PROMPT = `You are a game-logic bug detector. Review this game code and report ALL critical bugs that would cause a broken or unplayable game. Do not stop at the first bug — find every one.

Critical bugs to check (check EACH one, look at the ACTUAL code values):

1. INITIAL GAME STATE: \`useState<GameState>('start')\` MUST start at 'start'. If it's 'playing' or 'idle', no start screen is shown — user can't begin.

2. RAF LOOP GUARD: The useEffect starting the RAF loop MUST begin with \`if (gameState !== 'playing') return\`. Without this, the loop runs in every state.

3. RUNNING PROP (for useGameLoop): The \`running\` value passed MUST be a boolean expression like \`running={gameState === 'playing'}\`. A string like \`running={gameState}\` evaluates to truthy always.

4. KEYBOARD LISTENER STALE CLOSURE: Keydown handlers in useEffect must use refs (not state values directly). If handler reads state directly without a ref, it sees stale values and direction never updates.

5. RAF MISSING RECURSIVE CALL: The RAF callback must call \`requestAnimationFrame(loop)\` at the END to keep animating. Missing this = one frame then freezes.

6. CLICK/SPACE TO START: Must have a handler that sets gameState to 'playing' when user clicks or presses Space/Enter. If missing, game never starts.

7. DRAW COVERS ALL STATES: draw() must paint SOMETHING in every state. If it returns early for non-playing states, canvas is blank/black in those states.

8. SNAKE REVERSAL: pressig opposite direction (LEFT while going RIGHT) must be ignored.

Return JSON array of ALL bugs found (can be empty):
[{"issue":"one sentence with exact wrong code","fix":"corrected 5-20 line snippet showing the fix"}]

If no critical bugs found, return: []
Return raw JSON only — no markdown fences, no explanation.`

const WEBAPP_REVIEW_PROMPT = `You are a React webapp bug detector. Review this code and report ALL critical bugs that would cause crashes or non-functional features. Do not stop at first bug.

Check EACH:
1. DISALLOWED IMPORTS: only react, react-router-dom, lucide-react, @/components/ui/*, sonner, framer-motion. Any other src/ import fails.
2. INFINITE LOOPS: useEffect calling setState where the result is also a dep.
3. UNDEFINED.MAP: .map()/.filter() called on possibly-undefined arrays. All array state must be \`useState([])\`.
4. STATE MUTATION: \`arr.push()\` or \`arr.splice()\` on state arrays instead of \`setState([...arr, item])\`.
5. BROKEN ADD ACTION: primary "Add"/"Save"/"Submit"/"Create" button onClick must call a setState that adds an item. \`onClick={() => {}}\` or missing onClick = broken.
6. MISSING KEY: map() rendering JSX without unique key props.

Return JSON array of ALL bugs:
[{"issue":"one sentence with exact wrong code","fix":"corrected snippet"}]
If no bugs: []
Raw JSON only — no markdown.`

export async function reviewGeneratedCode(
  sandbox: Sandbox,
  skill: Skill,
): Promise<void> {
  if (skill === 'website') return

  const filePath = 'src/pages/Home.tsx'
  const reviewPrompt = skill === 'game' ? GAME_REVIEW_PROMPT : WEBAPP_REVIEW_PROMPT

  try {
    const content = await readSandboxFile(sandbox, filePath)
    if (!content || content.length < 200) return

    // Use up to 20000 chars to cover larger game files
    const codeSlice = content.slice(0, 20000)

    const { text } = await generateText({
      ...getModelOptions(DEFAULT_MODEL),
      maxOutputTokens: 2048,
      abortSignal: AbortSignal.timeout(25_000),
      messages: [{
        role: 'user',
        content: `${reviewPrompt}\n\n\`\`\`tsx\n${codeSlice}\n\`\`\``,
      }],
    })

    const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const bugs = JSON.parse(cleaned) as Array<{ issue: string; fix: string }>

    if (!Array.isArray(bugs) || bugs.length === 0) {
      console.log(`[code-review] ${skill} — no critical bugs found`)
      return
    }

    console.log(`[code-review] ${skill} — ${bugs.length} bug(s) detected:`)
    bugs.forEach((b, i) => console.log(`  [${i + 1}] ${b.issue}`))

    // Build a single comprehensive fix description covering all bugs
    const allBugDescriptions = bugs
      .map((b, i) => `Bug ${i + 1}: ${b.issue}\nFix:\n${b.fix}`)
      .join('\n\n')

    const fixed = await repairFile(
      filePath,
      content,
      `Found ${bugs.length} critical bug(s):\n\n${allBugDescriptions}`
    )

    if (fixed && fixed !== content) {
      await sandbox.writeFiles([{ path: filePath, content: Buffer.from(fixed, 'utf8') }])
      console.log(`[code-review] auto-repaired ${filePath} (${bugs.length} fixes applied)`)
    }
  } catch (err) {
    console.warn('[code-review] skipped:', err instanceof Error ? err.message : String(err))
  }
}
