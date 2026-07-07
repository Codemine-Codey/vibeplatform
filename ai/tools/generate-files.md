Use this tool to generate and upload all project files into the sandbox. Provide the list of file paths — the platform handles writing the actual content.

All file paths must be relative to the sandbox root (e.g., `src/index.ts`, `src/components/Button.tsx`).

## When to use

- Creating a new project — list every file the project needs
- Adding new files to an existing project

## Rules

- List EVERY file the project needs in one call — do not call this tool twice
- Do NOT include scaffold files: package.json, vite.config.ts, tailwind.config.js, postcss.config.js, tsconfig files, .npmrc, src/lib/utils.ts, src/components/ui/*
- Do NOT include src/App.tsx or src/main.tsx for websites/webapps — routing is scaffolded and file-based (any App.tsx/main.tsx you list is discarded). Create pages in src/pages/ instead (Home.tsx → "/", About.tsx → "/about"), and global nav/footer in src/components/Layout.tsx. (Games only: you DO write src/App.tsx — no router.)
- DO include src/index.css — always include it with brand-specific colors
- If you need extra packages, include package.json in the paths

## Example paths

```
src/index.css
src/pages/Home.tsx
src/pages/About.tsx
src/pages/Contact.tsx
src/components/Layout.tsx
src/components/Hero.tsx
```
(No src/App.tsx / src/main.tsx — those are scaffolded. Home.tsx is required and routes to "/".)
