import { resultSchema, type Line, type Lines } from './schemas'

export async function getSummary(lines: Line[], previous: Line[]) {
  const response = await fetch('/api/errors', {
    body: JSON.stringify({ lines, previous } satisfies Lines),
    method: 'POST',
  })

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
