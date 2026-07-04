import z from 'zod/v3'

export const errorSchema = z.object({
  message: z.string(),
})

export const dataPartSchema = z.object({
  'create-sandbox': z.object({
    sandboxId: z.string().optional(),
    projectId: z.string().optional(), // surfaced so the client can re-hydrate from snapshot on expiry
    status: z.enum(['loading', 'done', 'error']),
    error: errorSchema.optional(),
  }),
  'generating-files': z.object({
    paths: z.array(z.string()),
    status: z.enum(['generating', 'uploading', 'uploaded', 'done', 'error']),
    error: errorSchema.optional(),
  }),
  'run-command': z.object({
    sandboxId: z.string(),
    commandId: z.string().optional(),
    command: z.string(),
    args: z.array(z.string()),
    status: z.enum(['executing', 'running', 'waiting', 'done', 'error']),
    exitCode: z.number().optional(),
    error: errorSchema.optional(),
  }),
  'get-sandbox-url': z.object({
    url: z.string().optional(),
    status: z.enum(['loading', 'done']),
  }),
  'report-errors': z.object({
    summary: z.string(),
    paths: z.array(z.string()).optional(),
  }),
  'database-created': z.object({
    databaseId: z.string(),
    databaseName: z.string(),
  }),
  // Durable-runs STEP 1: emitted early so the client knows which run this stream
  // belongs to (used later to reconnect/replay via GET /api/runs/:id/stream).
  'run': z.object({
    runId: z.string(),
  }),
  // Durable-runs STEP 2: conversational phase narration. A warm, plain-English chat
  // message the SERVER posts at each phase boundary (preview live, page done, etc.).
  // Written via writer.write so it is dual-written to the canonical run_events log
  // (model prose bypasses that log). Rendered in chat exactly like an assistant line.
  'narration': z.object({
    text: z.string(),
  }),
})

export type DataPart = z.infer<typeof dataPartSchema>
