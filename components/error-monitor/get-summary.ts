import { resultSchema, type Line, type Lines } from './schemas'

export async function getSummary(lines: Line[], previous: Line[]) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  let response: Response
  try {
    response = await fetch('/api/errors', {
      body: JSON.stringify({ lines, previous } satisfies Lines),
      method: 'POST',
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Error analysis timed out after 30s')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw new Error(`Error analysis request failed: ${response.status} ${response.statusText}`)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error('Error analysis returned invalid JSON')
  }

  const result = resultSchema.safeParse(body)
  if (!result.success) {
    throw new Error(`Unexpected error analysis response: ${result.error.message}`)
  }
  return result.data
}
