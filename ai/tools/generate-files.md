Write all project files into the sandbox in a single call. You MUST provide the complete content for every file — there is no separate file-generation step.

## Required usage

Call this tool EXACTLY ONCE with:
- `sandboxId`: the sandbox ID from createSandbox
- `files`: an array of `{ path, content }` objects — one per file, with COMPLETE content

## Rules

- Every file you planned must be in this array with its full, runnable content
- Do NOT include scaffold files: package.json, vite.config.ts, tailwind.config.js, postcss.config.js, tsconfig files, .npmrc, src/lib/utils.ts, src/components/ui/*
- DO include `src/index.css` — this is the one scaffold file you must provide with brand-specific colors and Google Font import
- Never call this tool twice — all files go into one call
- No placeholders, no stubs, no TODO comments in the content — complete and functional

## Examples of paths to include

```
index.html
src/main.tsx
src/index.css
src/App.tsx
src/pages/Home.tsx
src/pages/About.tsx
src/components/Nav.tsx
src/components/Footer.tsx
src/components/HeroSection.tsx
```
