import { tool } from 'ai'
import z from 'zod/v3'
import type { UIMessage, UIMessageStreamWriter } from 'ai'
import type { DataPart } from '../messages/data-parts'
import { Sandbox } from '@vercel/sandbox'

interface Params {
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>
}

export const createDatabase = ({ writer }: Params) =>
  tool({
    description:
      'Create a real database for the project and connect it automatically. ' +
      'Use this when the user asks to add a database or persistence. ' +
      'ALWAYS ask the user what they want to store before calling this tool.',
    inputSchema: z.object({
      sandboxId: z.string().describe('The sandbox ID for this project'),
      name: z.string().describe('Short slug for the database, e.g. "tasklist", "products", "users"'),
    }),
    execute: async ({ sandboxId, name }, { toolCallId }) => {
      const CF_API_TOKEN = process.env.CF_API_TOKEN
      const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID

      if (!CF_API_TOKEN || !CF_ACCOUNT_ID) {
        return 'Database service is not configured on this platform.'
      }

      const dbName = `cm-${name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 18)}-${Date.now().toString(36)}`

      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${CF_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: dbName }),
        }
      )
      const raw = await res.text()
      let data: { success: boolean; result?: { uuid: string; name: string }; errors?: { message: string }[] }
      try { data = JSON.parse(raw) } catch { data = { success: false } }

      if (!data.success || !data.result) {
        const msg = data.errors?.[0]?.message ?? 'Failed to create database'
        return `Database creation failed: ${msg}`
      }

      const databaseId = data.result.uuid
      const databaseName = data.result.name

      // Update the Database tab in the UI
      writer.write({
        id: toolCallId,
        type: 'data-database-created',
        data: { databaseId, databaseName },
      })

      // Re-write .env with correct platform URL — older projects may have a stale URL.
      // Best-effort: if sandbox lookup fails, the AI's code still works if .env is correct.
      try {
        const apiBase = process.env.CM_PUBLIC_BASE_URL || 'https://codemineapp.com'
        const sandbox = await Sandbox.get({ sandboxId })
        const envLine = `VITE_CODEMINE_API=${apiBase}\n`
        // Read existing .env, patch or append VITE_CODEMINE_API line
        const existing = await (async () => {
          try {
            const stream = await sandbox.readFile({ path: '.env' })
            if (!stream) return ''
            const chunks: Buffer[] = []
            for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as string))
            return Buffer.concat(chunks).toString('utf8')
          } catch { return '' }
        })()
        const patched = existing.includes('VITE_CODEMINE_API=')
          ? existing.replace(/VITE_CODEMINE_API=.*/g, `VITE_CODEMINE_API=${apiBase}`)
          : existing + (existing.endsWith('\n') ? '' : '\n') + envLine
        await sandbox.writeFiles([{ path: '.env', content: Buffer.from(patched, 'utf8') }])
      } catch { /* non-fatal */ }

      return (
        `Database created. Name: ${databaseName}\n\n` +
        `IMPORTANT — how to write data from the SPA:\n` +
        `The platform has injected VITE_CODEMINE_API and VITE_PROJECT_ID into the app's .env (already done — do NOT create or overwrite .env yourself). ` +
        `Use this EXACT pattern for ALL database writes (contact forms, saving records, etc.):\n\n` +
        `const res = await fetch(\`\${import.meta.env.VITE_CODEMINE_API}/api/db/write\`, {\n` +
        `  method: 'POST',\n` +
        `  headers: { 'Content-Type': 'application/json' },\n` +
        `  body: JSON.stringify({\n` +
        `    projectId: import.meta.env.VITE_PROJECT_ID,\n` +
        `    table: 'your_table_name',\n` +
        `    data: { column1: value1, column2: value2 }\n` +
        `  })\n` +
        `})\n\n` +
        `NEVER create a custom Express server or proxy. NEVER use fetch('http://localhost:...'). ` +
        `NEVER put the database ID in client code. ` +
        `Now write the SQL schema (CREATE TABLE statements) using runCommand with pnpm exec wrangler d1 execute ${databaseName} --remote --command "CREATE TABLE ..." and then implement the full data layer using the fetch pattern above.`
      )
    },
  })
