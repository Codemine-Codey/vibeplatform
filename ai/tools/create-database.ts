import { tool } from 'ai'
import { Sandbox } from '@vercel/sandbox'
import z from 'zod/v3'
import type { UIMessage, UIMessageStreamWriter } from 'ai'
import type { DataPart } from '../messages/data-parts'

interface Params {
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>
}

export const createDatabase = ({ writer }: Params) =>
  tool({
    description:
      'Create a real Cloudflare D1 database for the project and connect it automatically. ' +
      'Use this when the user asks to add a database. ' +
      'ALWAYS ask the user what they want to store before calling this tool.',
    parameters: z.object({
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

      // Inject env vars into sandbox so the app can reference DB_ID at build time
      try {
        const sandbox = await Sandbox.get({ sandboxId })
        await sandbox.writeFiles([{
          path: '.env.local',
          content: Buffer.from(
            `VITE_DB_ID=${databaseId}\nVITE_CF_ACCOUNT_ID=${CF_ACCOUNT_ID}\n`,
            'utf8'
          ),
        }])
      } catch {
        // Non-fatal — database created successfully even if env write fails
      }

      // Update the Database tab in the UI
      writer.write({
        id: toolCallId,
        type: 'data-database-created',
        data: { databaseId, databaseName },
      })

      return (
        `Database created and connected.\n` +
        `Name: ${databaseName}\nID: ${databaseId}\n\n` +
        `VITE_DB_ID is now available in the sandbox. ` +
        `Now write the schema (CREATE TABLE SQL) and the code to read/write data using the CF D1 REST API. ` +
        `Account ID for API calls: ${CF_ACCOUNT_ID}`
      )
    },
  })
