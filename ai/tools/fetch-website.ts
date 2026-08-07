import { tool } from 'ai'
import z from 'zod/v3'

// Fetch a website as markdown for design reference or API documentation.
// Useful when user says "make it look like X" or when studying a live API docs page.
export const fetchWebsite = () =>
  tool({
    description:
      'Fetch a website and return its content as readable text. Use when the user references a URL for design inspiration ("make it like Linear"), ' +
      'or when you need to read live API documentation. Returns the page title, description, and main content as markdown. ' +
      'Do NOT use for internal/authenticated pages — only public URLs.',
    inputSchema: z.object({
      url: z.string().url().describe('The URL to fetch, e.g. "https://linear.app" or "https://phaser.io/examples"'),
      purpose: z.string().optional().describe('What you are looking for, e.g. "design layout" or "API method signatures"'),
    }),
    execute: async ({ url, purpose }) => {
      try {
        // Use Jina.ai reader for clean markdown extraction
        const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`
        const res = await fetch(jinaUrl, {
          headers: {
            Accept: 'text/plain',
            'X-Return-Format': 'markdown',
          },
          signal: AbortSignal.timeout(12_000),
        })

        if (!res.ok) {
          // Fallback: direct fetch with basic HTML stripping
          const direct = await fetch(url, { signal: AbortSignal.timeout(8_000) })
          if (!direct.ok) return { error: `Could not fetch ${url} (${res.status})` }
          const html = await direct.text()
          // Strip tags crudely for basic content
          const text = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 3000)
          return { url, content: text, note: 'HTML stripped (Jina unavailable)' }
        }

        const markdown = await res.text()
        // Cap content to avoid flooding context
        const capped = markdown.length > 4000
          ? markdown.slice(0, 4000) + '\n\n…(truncated — use this excerpt for reference)'
          : markdown

        return {
          url,
          purpose: purpose ?? 'reference',
          content: capped,
        }
      } catch (err) {
        return {
          error: `Could not fetch ${url}: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    },
  })
