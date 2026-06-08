Use this tool to generate and upload all project files into the sandbox. Provide the list of file paths — the platform handles writing the actual content.

All file paths must be relative to the sandbox root (e.g., `src/index.ts`, `src/components/Button.tsx`).

## When to use

- Creating a new project — list every file the project needs
- Adding new files to an existing project

## Rules

- List EVERY file the project needs in one call — do not call this tool twice
- Do NOT include scaffold files: package.json, vite.config.ts, tailwind.config.js, postcss.config.js, tsconfig files, .npmrc, src/lib/utils.ts, src/components/ui/*
- DO include src/index.css — always include it with brand-specific colors
- If you need extra packages, include package.json in the paths

## Example paths

```
index.html
src/main.tsx
src/index.css
src/App.tsx
src/pages/Home.tsx
src/pages/About.tsx
src/components/Nav.tsx
src/components/Footer.tsx
```
