import { tool } from 'ai'
import z from 'zod/v3'

export const planProject = () =>
  tool({
    description:
      'Commit to the complete project architecture — a BUILD MANIFEST — before generating any files. ' +
      'Only call this for NEW project generation — never during edits to an existing project. ' +
      'Call this after getUnsplashBatch (or createSandbox for image-free projects) and before generateFiles. ' +
      'The manifest is FINAL: generateFiles must produce exactly these files, and each file must export ' +
      'exactly the names you declare here. Declaring the exports up-front is what prevents cross-file ' +
      'import drift (importing useHabitStore when the store actually exports useStore).',
    inputSchema: z.object({
      files: z
        .array(
          z.object({
            path: z
              .string()
              .describe('File path relative to sandbox root, e.g. src/store/useCart.ts'),
            exports: z
              .array(z.string())
              .describe(
                'The EXACT named exports this file will provide (the identifiers other files will import). ' +
                'e.g. ["useCart","CartItem"]. For a default-only component file (e.g. src/components/Hero.tsx) ' +
                'use ["default"]. Be precise — these names are the contract every importing file must match.'
              ),
          })
        )
        .min(1)
        .describe(
          'Complete ordered build manifest — every file to generate, each with its exact exports. ' +
          'Order foundation files (types, store, hooks, lib, data) BEFORE the components/pages that import them. ' +
          'Do NOT include scaffold files: package.json, vite.config.ts, tailwind.config.js, ' +
          'postcss.config.js, tsconfig.json, tsconfig.app.json, tsconfig.node.json, .npmrc, src/main.tsx.'
        ),
      extraPackages: z
        .array(z.string())
        .optional()
        .describe(
          'Additional npm packages beyond the pre-installed scaffold base. ' +
          'Scaffold already includes: react, react-dom, react-router-dom, lucide-react, framer-motion, ' +
          'vite, tailwindcss, typescript, @vitejs/plugin-react, autoprefixer, postcss.'
        ),
    }),
    execute: async ({ files, extraPackages }) => {
      const pkgNote = extraPackages?.length
        ? `\nExtra packages: ${extraPackages.join(', ')} — declare them in package.json before generateFiles.`
        : '\nScaffold packages cover all dependencies — no extra installs needed.'
      // Surface the export contract back to the model so the very next step (generateFiles)
      // writes every import against these exact names — no guessing, no drift.
      const contract = files
        .map((f) => `- ${f.path} → exports { ${f.exports.join(', ')} }`)
        .join('\n')
      const paths = files.map((f) => f.path)
      return (
        `Manifest locked — ${files.length} files. This is the export CONTRACT; every import must match it exactly:\n` +
        `${contract}${pkgNote}\n\n` +
        `Now call generateFiles with exactly these ${files.length} paths: ${paths.join(', ')}. ` +
        `Each file must export precisely the names declared above.`
      )
    },
  })
