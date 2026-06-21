---
name: webapp-patterns
description: Professional web-app craft — screen inventory, navigation shell, the full state matrix (loading/empty/error/populated), data display, and keyboard/a11y. Load for any app/dashboard/tool build.
---

# Web-app patterns — make it feel like a real product

## Architecture first
- List every screen/view, then define ONE persistent navigation shell (sidebar or top bar + content area) reused across all screens.
- Each screen is a real route. Density suits the task: a dashboard is data-forward and tight; a focused tool is calm.

## The state matrix — EVERY data view handles all four
- **Loading**: skeletons that match the content shape (not a centered spinner on white).
- **Empty**: a CSS-only illustration (Tailwind shapes/gradients) or a large Lucide icon + a helpful prompt + a primary action. Never a grey box.
- **Error**: a calm message with a recovery action.
- **Populated**: the full working experience.
- **Success**: satisfying confirmation with context (what happened, what's next).

## Data display
- Tables: sticky header, zebra or hairline rows, right-aligned numbers, sortable columns, row hover.
- Cards/stats: real numbers with trend indicators; consistent grid.
- Charts: use a real lib (recharts) — include package.json. Label axes, use the brand accent.

## Interaction quality
- Every action gives immediate feedback (optimistic UI or a pending state).
- Keyboard: Enter submits, Esc closes, Tab order is logical. Focus rings visible.
- Forms: labels ABOVE inputs (never placeholder-as-label), inline validation, disabled→loading on submit.
- localStorage persistence is mandatory — data survives refresh.

## A11y baseline
- Semantic HTML (button is a button, nav is nav). aria-labels on icon-only buttons.
- Color contrast ≥ WCAG AA. Respect `prefers-reduced-motion`.
