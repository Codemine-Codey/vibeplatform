import { generateText } from 'ai'
import { getModelOptions } from './gateway'
import { ORCHESTRATION_MODEL } from './constants'

// Context-aware follow-up suggestions ("pills"). After a build/edit, a lightweight model
// proposes 3 short, action-oriented next steps based on the user's request + what was built.
// Best-effort: any failure returns [] so the pipeline never blocks on it.
export async function generateSuggestions(opts: {
  request: string
  skill: string
  filePaths?: string[]
}): Promise<string[]> {
  const { request, skill, filePaths = [] } = opts
  if (!request) return []
  try {
    const { text } = await generateText({
      ...getModelOptions(ORCHESTRATION_MODEL),
      maxOutputTokens: 300,
      abortSignal: AbortSignal.timeout(12_000),
      messages: [{
        role: 'user',
        content:
          `The user is building a ${skill}. Their request: "${request.slice(0, 400)}".\n` +
          (filePaths.length ? `Files just built: ${filePaths.slice(0, 20).join(', ')}.\n` : '') +
          `Suggest exactly 3 SHORT, specific, action-oriented follow-ups the user might ask next ` +
          `(each ≤6 words, phrased as a request the user would type, e.g. "Add a contact form", ` +
          `"Make the hero darker", "Add a leaderboard"). Return ONLY a JSON array of 3 strings, no markdown.`,
      }],
    })
    const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const arr = JSON.parse(cleaned) as unknown
    if (!Array.isArray(arr)) return []
    return arr
      .filter((s): s is string => typeof s === 'string')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 60)
      .slice(0, 3)
  } catch {
    return []
  }
}
