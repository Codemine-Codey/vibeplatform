import { tool, generateText } from 'ai'
import { Sandbox } from '@vercel/sandbox'
import { getModelOptions } from '@/ai/gateway'
import description from './visual-check.md'
import z from 'zod/v3'

// Claude Haiku — fast, cheap, vision-capable for future screenshot upgrade
const REVIEW_MODEL = 'claude-haiku-4-5-20251001'

export const visualCheck = () =>
  tool({
    description,
    inputSchema: z.object({
      sandboxId: z.string(),
      projectDescription: z
        .string()
        .describe('Brief description of what the project should look like and do'),
      keyFiles: z
        .array(z.string())
        .describe('Source files to review — always include src/App.tsx and src/index.css'),
    }),
    execute: async ({ sandboxId, projectDescription, keyFiles }) => {
      let sandbox: Sandbox
      try {
        sandbox = await Sandbox.get({ sandboxId })
      } catch {
        return 'Visual check skipped: sandbox not accessible'
      }

      // Read up to 6 key files (cap per-file at 4000 chars to stay within Haiku context)
      const fileContents: string[] = []
      for (const filePath of keyFiles.slice(0, 6)) {
        try {
          const stream = await sandbox.readFile({ path: filePath })
          if (!stream) continue
          const chunks: Buffer[] = []
          for await (const chunk of stream) {
            if (Buffer.isBuffer(chunk)) chunks.push(chunk)
            else if (typeof chunk === 'string') chunks.push(Buffer.from(chunk, 'utf8'))
            else chunks.push(Buffer.from(chunk as ArrayBuffer))
          }
          const content = Buffer.concat(chunks).toString('utf8').slice(0, 4000)
          fileContents.push(`### ${filePath}\n\`\`\`\n${content}\n\`\`\``)
        } catch {
          // skip unreadable files
        }
      }

      if (fileContents.length === 0) {
        return 'Visual check skipped: no files readable'
      }

      const result = await generateText({
        ...getModelOptions(REVIEW_MODEL),
        maxOutputTokens: 600,
        messages: [
          {
            role: 'user',
            content: `You are a senior frontend reviewer. Review these React source files and check whether the project correctly implements its brief.

**Project brief:** ${projectDescription}

**Check for these issues:**
1. Root component returns nearly nothing (empty div, null, or just a heading)
2. Placeholder text: "Lorem ipsum", "TODO", "Coming soon", "[Your Name]", "placeholder"
3. Key sections from the brief that are completely missing
4. @import 'tailwindcss/base' in CSS (should be @tailwind base; — this crashes the dev server)
5. Google Fonts @import missing from src/index.css (brand fonts won't load)
6. Broken import paths referencing files that don't exist in the file list
7. CSS variables undefined or set to wrong values that would cause invisible text

**Source files:**
${fileContents.join('\n\n')}

Respond in EXACTLY this format — no extra text:
LOOKS_CORRECT: yes/no
ISSUES:
- (list each issue, or write "none" if no issues)
CRITICAL: yes/no (yes = the page would be blank or crashed)`,
          },
        ],
      })

      return result.text
    },
  })
