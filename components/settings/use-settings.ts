import { parseAsBoolean, useQueryState } from 'nuqs'
import { DEFAULT_MODEL } from '@/ai/constants'

export function useSettings() {
  const [fixErrors] = useFixErrors()
  return { modelId: DEFAULT_MODEL, fixErrors }
}

export function useFixErrors() {
  return useQueryState('fix-errors', parseAsBoolean.withDefault(true))
}
