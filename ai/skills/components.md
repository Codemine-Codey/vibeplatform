---
name: components
description: Pre-installed shadcn/ui components catalog + composition patterns. Load to reuse ready-made, accessible components instead of hand-building buttons, cards, dialogs, forms, etc.
---

# Components — reuse, don't rebuild

These shadcn/ui components are ALREADY installed in every project. Import and use them — do NOT hand-build equivalents. They are accessible, themeable (they read the CSS color tokens), and consistent.

## Available (import from `@/components/ui/<name>`)
- **button** — `import { Button } from '@/components/ui/button'` · variants: default, secondary, outline, ghost, destructive, link · sizes: sm, default, lg, icon
- **card** — `Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter`
- **input** — `Input` (text fields) · pair with **label** (`Label`)
- **textarea** — `Textarea` (multiline)
- **select** — `Select, SelectTrigger, SelectValue, SelectContent, SelectItem`
- **dialog** — `Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter` (modals)
- **badge** — `Badge` · variants: default, secondary, outline, destructive (tags/pills)
- **label** — `Label` (form labels, always ABOVE the input)
- **separator** — `Separator` (hairline dividers)

## Rules
- Reach for these FIRST. A custom `<button>` with hand-written Tailwind is a smell — use `<Button>`.
- They inherit the brand via CSS tokens (bg-primary, etc.) — so a themed Button matches the palette automatically. Don't override their colors with raw hex.
- Forms: `Label` above `Input`/`Textarea`/`Select`, with a submit `Button` that shows a pending state.
- Need a component NOT in this list (tabs, accordion, tooltip, dropdown)? You may add the shadcn source file for it in the same generation, OR compose from the primitives above — but never ship an inaccessible hand-rolled version.

## Composition examples
```tsx
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
// Pricing card
<Card className="border-border">
  <CardHeader><CardTitle className="text-foreground">Pro</CardTitle></CardHeader>
  <CardContent>
    <p className="text-muted-foreground">Everything you need.</p>
    <Button className="mt-4 w-full">Get started</Button>
  </CardContent>
</Card>
```
