---
name: components
description: When to REUSE a pre-made shadcn/ui component vs BUILD a custom one — a smart per-element decision, plus how to pull any shadcn component on demand. Load when building UI that mixes standard controls and signature design.
---

# Components — a smart decision, never a forced one

Reusing components everywhere makes a site look templated and AI-generated. Hand-building everything is inconsistent and slow. **Decide per element — this is a judgment call, not a rule:**

## The decision
- **REUSE a pre-made component when** the element is a STANDARD control where users expect familiar behavior and accessibility matters more than uniqueness: form inputs, selects, checkboxes, dialogs/modals, dropdowns, tooltips, tabs, command palettes, date pickers, data tables. Reinventing these is a waste and usually less accessible.
- **BUILD custom when** the element CARRIES THE BRAND'S DESIGN IDENTITY — the hero, signature sections, the distinctive layout moments, anything that should look art-directed and unlike every other site. Dropping a generic component here is exactly what makes output look templated. The taste-design law applies here: this is where craft lives.

Rule of thumb: **plumbing → reuse; craft → custom.** A login form? Reuse. The hero that defines the brand? Custom. A pricing section's toggle? Reuse the control, but the section's layout is yours to design.

## What's available
**Pre-installed (import from `@/components/ui/<name>`, zero setup):** button, card, input, textarea, select, dialog, badge, label, separator. They read the CSS color tokens, so they match the brand palette automatically — don't override with raw hex.

**Any other shadcn component, on demand:** the full shadcn registry (~48: accordion, tabs, carousel, tooltip, dropdown-menu, sheet, popover, command, table, calendar, avatar, switch, slider, progress, skeleton, sonner/toast, navigation-menu, hover-card, etc.) can be added when you decide reuse is the smart call — run `npx shadcn@latest add <name>` in the workspace (it fetches the official, correct source). Use this instead of hand-writing a standard control.

## Notes
- A reused component still gets YOUR styling via className + tokens — reuse the behavior/accessibility, not a generic look.
- Never ship an inaccessible hand-rolled version of something shadcn already does well (a div pretending to be a dropdown).
- Conversely, never let a stock component flatten a signature section — that section is where you design.
