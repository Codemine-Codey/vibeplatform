import { Sandbox } from '@vercel/sandbox'
import { getSandboxCredentials } from '@/lib/sandbox-credentials'
import { tool } from 'ai'
import z from 'zod/v3'
import { getAdminSupabase } from '@/lib/supabase/server'

const MEMORY_PATH = '.codey/memory.md'

// Project memory — persists across edit sessions in two layers:
//   1. .codey/memory.md in the sandbox (fast, in-session access)
//   2. projects.memory_md in Supabase (survives sandbox eviction)
export const getProjectMemory = () =>
  tool({
    description:
      'Read the project memory at the start of an edit session. ' +
      'Memory contains: all generated files and their purpose, design decisions (colors/fonts/tone), ' +
      'user preferences from past edits, and recent fix history. ' +
      'Always call this FIRST in an edit session before touching any files.',
    inputSchema: z.object({
      sandboxId: z.string().describe('The workspace ID'),
      projectId: z.string().optional().describe('The project ID for Supabase fallback when sandbox is cold'),
    }),
    execute: async ({ sandboxId, projectId }) => {
      // Try sandbox first (warm path)
      try {
        const sandbox = await Sandbox.get({ ...getSandboxCredentials(), sandboxId })
        const cmd = await sandbox.runCommand({ cmd: 'cat', args: [MEMORY_PATH], detached: true })
        const done = await cmd.wait()

        if (done.exitCode === 0) {
          const memory = await done.stdout()
          if (memory.trim()) {
            return {
              exists: true,
              memory: memory.slice(0, 8000),
              source: 'workspace',
              note: 'Use this context to understand the project before making changes. Do not re-read files already described here.',
            }
          }
        }
      } catch { /* sandbox cold — fall through to Supabase */ }

      // Supabase fallback (cold sandbox, project re-opened from dashboard)
      if (projectId) {
        try {
          const sb = getAdminSupabase()
          const { data } = await sb.from('projects').select('memory_md').eq('id', projectId).single()
          if (data?.memory_md) {
            return {
              exists: true,
              memory: (data.memory_md as string).slice(0, 8000),
              source: 'database',
              note: 'Memory restored from database (workspace was restarted). Use this as your project context.',
            }
          }
        } catch { /* non-fatal */ }
      }

      return {
        exists: false,
        memory: null,
        note: 'No project memory found — fresh project or memory not yet written. Proceed by reading the relevant files.',
      }
    },
  })

export const updateProjectMemory = () =>
  tool({
    description:
      'Write or update the project memory file. ' +
      'Call this after every initial build (to record the full file manifest, design, and stack) ' +
      'and after every significant edit (to record what changed and why). ' +
      'Memory persists even when the workspace is restarted.',
    inputSchema: z.object({
      sandboxId: z.string().describe('The workspace ID'),
      projectId: z.string().optional().describe('The project ID for Supabase persistence'),
      content: z.string().describe(
        'Full markdown content for the memory file. Include:\n' +
        '# Project Memory\n' +
        'Type: game|webapp|website\n' +
        'Built: YYYY-MM-DD\n' +
        'Stack: [key packages]\n\n' +
        '## File Manifest\n' +
        '- path — purpose (one line)\n\n' +
        '## Design\n' +
        'Colors, fonts, tone\n\n' +
        '## User Preferences\n' +
        '(things the user corrected or asked for)\n\n' +
        '## Recent Edits\n' +
        '- what changed and why'
      ),
    }),
    execute: async ({ sandboxId, projectId, content }) => {
      const results: string[] = []

      // Write to sandbox
      try {
        const sandbox = await Sandbox.get({ ...getSandboxCredentials(), sandboxId })
        const mkdir = await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', '.codey'], detached: true })
        await mkdir.wait()
        await sandbox.writeFiles([{ path: MEMORY_PATH, content: Buffer.from(content, 'utf8') }])
        results.push('workspace')
      } catch (err) {
        results.push(`workspace-failed: ${err instanceof Error ? err.message : String(err)}`)
      }

      // Persist to Supabase so memory survives sandbox eviction
      if (projectId) {
        try {
          const sb = getAdminSupabase()
          await sb.from('projects').update({ memory_md: content }).eq('id', projectId)
          results.push('database')
        } catch { /* non-fatal — sandbox copy is enough for this session */ }
      }

      return {
        success: results.some(r => !r.includes('failed')),
        persisted: results,
        path: MEMORY_PATH,
        message: 'Project memory updated.',
      }
    },
  })
