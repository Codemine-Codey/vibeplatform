import { tool } from 'ai'
import z from 'zod/v3'

export const planProject = () =>
  tool({
    description:
      'Commit to the complete project architecture before generating any files. ' +
      'Call this after getUnsplashBatch and before generateFiles. ' +
      'The file list in the plan is final — generateFiles must use exactly these paths.',
    inputSchema: z.object({
      files: z
        .array(z.string())
        .min(1)
        .describe(
          'Complete ordered list of every file to generate (paths relative to sandbox root). ' +
          'Do NOT include scaffold files: package.json, vite.config.ts, tailwind.config.js, ' +
          'postcss.config.js, tsconfig.json, tsconfig.app.json, tsconfig.node.json, .npmrc'
        ),
      extraPackages: z
        .array(z.string())
        .optional()
        .describe(
          'Additional npm packages beyond the pre-installed scaffold base. ' +
          'Scaffold already includes: react, react-dom, react-router-dom, lucide-react, ' +
          'vite, tailwindcss, typescript, @vitejs/plugin-react, autoprefixer, postcss.'
        ),
    }),
    execute: async ({ files, extraPackages }) => {
      const pkgNote =
        extraPackages?.length
          ? `\nExtra packages needed: ${extraPackages.join(', ')} — add them to package.json before generateFiles.`
          : '\nScaffold packages cover all dependencies — no extra installs needed.'
      return (
        `Plan locked. ${files.length} files to generate: ${files.join(', ')}.${pkgNote}\n` +
        `Now call generateFiles with exactly these ${files.length} paths.`
      )
    },
  })
