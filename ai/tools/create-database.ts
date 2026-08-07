import { tool } from 'ai'
import z from 'zod/v3'
import type { UIMessage, UIMessageStreamWriter } from 'ai'
import type { DataPart } from '../messages/data-parts'
import { Sandbox } from '@vercel/sandbox'
import { neon } from '@neondatabase/serverless'

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
      const NEON_DATABASE_URL = process.env.NEON_DATABASE_URL

      if (!NEON_DATABASE_URL) {
        return 'Database service is not configured on this platform.'
      }

      // Schema name: unique per project, safe for Postgres identifiers
      const schemaName = `cm_${name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 18)}_${Date.now().toString(36)}`
      const displayName = `cm-${name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 18)}`

      // Create the schema in the shared Neon database
      try {
        const sql = neon(NEON_DATABASE_URL)
        await sql(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        return `Database schema creation failed: ${msg}`
      }

      // Tell the UI about the new database
      writer.write({
        id: toolCallId,
        type: 'data-database-created',
        data: { databaseId: schemaName, databaseName: displayName },
      })

      // Write DATABASE_URL + VITE_DATABASE_URL into the sandbox .env
      // so the AI can run server-side Node scripts and the SPA can reference it.
      try {
        const sandbox = await Sandbox.get({ sandboxId })
        const envEntry = `DATABASE_URL=${NEON_DATABASE_URL}\nVITE_DATABASE_URL=${NEON_DATABASE_URL}\nVITE_DB_SCHEMA=${schemaName}\n`
        const existing = await (async () => {
          try {
            const stream = await sandbox.readFile({ path: '.env' })
            if (!stream) return ''
            const chunks: Buffer[] = []
            for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as string))
            return Buffer.concat(chunks).toString('utf8')
          } catch { return '' }
        })()
        // Patch or append the three vars
        let patched = existing
        const lines = [
          ['DATABASE_URL', `DATABASE_URL=${NEON_DATABASE_URL}`],
          ['VITE_DATABASE_URL', `VITE_DATABASE_URL=${NEON_DATABASE_URL}`],
          ['VITE_DB_SCHEMA', `VITE_DB_SCHEMA=${schemaName}`],
        ] as const
        for (const [key, line] of lines) {
          if (patched.includes(`${key}=`)) {
            patched = patched.replace(new RegExp(`${key}=.*`, 'g'), line)
          } else {
            patched = patched + (patched.endsWith('\n') ? '' : '\n') + line + '\n'
          }
        }
        await sandbox.writeFiles([{ path: '.env', content: Buffer.from(patched, 'utf8') }])
      } catch { /* non-fatal — AI can still use the injected env var */ }

      const apiBase = process.env.CM_PUBLIC_BASE_URL || 'https://codemineapp.com'

      return (
        `Database ready. Schema: ${schemaName}\n\n` +
        `DATABASE_URL, VITE_DATABASE_URL, and VITE_DB_SCHEMA are now in the workspace .env.\n\n` +
        `STEP 1 — Create your tables using runCommand with this Node.js script:\n` +
        `\`\`\`\n` +
        `node -e "\n` +
        `const { neon } = require('@neondatabase/serverless');\n` +
        `const sql = neon(process.env.DATABASE_URL);\n` +
        `sql\`SET search_path TO \\"${schemaName}\\"\`\n` +
        `  .then(() => sql\`CREATE TABLE IF NOT EXISTS your_table (id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now())\`)\n` +
        `  .then(() => console.log('Tables created'))\n` +
        `  .catch(e => { console.error(e); process.exit(1) });\n` +
        `"\n` +
        `\`\`\`\n\n` +
        `STEP 2 — Write data from the SPA using VITE_CODEMINE_API (never put DATABASE_URL in client code):\n` +
        `\`\`\`typescript\n` +
        `const res = await fetch(\`\${import.meta.env.VITE_CODEMINE_API}/api/db/write\`, {\n` +
        `  method: 'POST',\n` +
        `  headers: { 'Content-Type': 'application/json' },\n` +
        `  body: JSON.stringify({\n` +
        `    projectId: import.meta.env.VITE_PROJECT_ID,\n` +
        `    table: 'your_table_name',\n` +
        `    data: { column1: value1, column2: value2 }\n` +
        `  })\n` +
        `})\n` +
        `\`\`\`\n\n` +
        `STEP 3 — For server-side reads (API routes, not SPA), query Neon directly:\n` +
        `\`\`\`typescript\n` +
        `import { neon } from '@neondatabase/serverless'\n` +
        `const sql = neon(import.meta.env.VITE_DATABASE_URL)\n` +
        `const rows = await sql\`SET search_path TO "${schemaName}"; SELECT * FROM your_table\`\n` +
        `\`\`\`\n\n` +
        `NEVER put DATABASE_URL in client-side code. NEVER fetch http://localhost. ` +
        `NEVER create a custom Express server. Use ${apiBase}/api/db/write for all SPA writes.`
      )
    },
  })
