After files are generated and the dev server is running, call this tool to verify the project is correct.

It reads the generated source files and uses an AI reviewer to check for common issues:
- Blank or nearly empty content (nothing in the root component)
- Placeholder text: "Lorem ipsum", "TODO", "Coming soon", "placeholder"
- Missing key sections from the brief
- Broken imports or undefined components
- CSS syntax that would crash the dev server (e.g. @import 'tailwindcss/base')
- Missing Google Fonts @import in src/index.css
- Invisible text due to wrong color contrast

## When to call

Call ONCE after `runCommand` starts the dev server. Always include:
- `src/App.tsx` in keyFiles
- `src/index.css` in keyFiles
- Any top-level page components (e.g. `src/pages/Home.tsx`, `src/components/Hero.tsx`)

## Example

```json
{
  "sandboxId": "sandbox_abc123",
  "projectDescription": "Dark editorial spa website with warm amber tones, hero section, services, gallery, contact",
  "keyFiles": ["src/App.tsx", "src/index.css", "src/components/Hero.tsx", "src/components/Services.tsx"]
}
```

If the review returns issues, fix them immediately using patchFile or generateFiles (for the specific broken files only).
