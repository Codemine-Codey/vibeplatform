# Web App Skill Pack — Design & Code Patterns

## Layout Structure
Choose one based on complexity:
- **Sidebar layout** (for multi-section apps): Fixed 240px sidebar + scrollable main content
- **Top nav layout** (for simpler apps): Sticky header + full-width content area
- Both: Always include a persistent header bar showing current page title + primary action

## Sidebar Pattern
```jsx
<div className="flex h-screen bg-background">
  {/* Sidebar */}
  <aside className="w-60 border-r flex flex-col shrink-0">
    <div className="p-4 border-b">
      <span className="font-bold text-lg">{brandName}</span>
    </div>
    <nav className="flex-1 p-3 space-y-1">
      {navItems.map(item => (
        <NavLink to={item.path} className={({isActive}) =>
          `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
           ${isActive ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-secondary text-foreground/70'}`
        }>
          {item.icon}<span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
    <div className="p-3 border-t">
      {/* Settings link at bottom */}
    </div>
  </aside>
  {/* Main */}
  <main className="flex-1 overflow-auto">
    <Outlet />
  </main>
</div>
```

## Color Application
- Base: neutral (`slate` or `gray` scale) for backgrounds and borders
- Single accent from brief — applied to primary buttons, active nav, key metrics
- Semantic colors (always consistent):
  - Success: `green-500` / `green-100` bg
  - Error/Destructive: `red-500` / `red-50` bg
  - Warning: `amber-500` / `amber-50` bg
  - Info: `blue-500` / `blue-50` bg
- Dark mode: define CSS variables, use `dark:` Tailwind prefix

## Typography
- Body text: `text-sm` to `text-base` (apps are denser than marketing sites)
- Page headings: `text-2xl font-bold` or `text-xl font-semibold`
- Labels/captions: `text-xs text-muted-foreground`
- Monospace for numbers, IDs, code: `font-mono`

## Component Patterns

**Stat Card:**
```jsx
<div className="p-6 rounded-xl border bg-card">
  <p className="text-sm text-muted-foreground mb-1">Total Revenue</p>
  <p className="text-3xl font-bold tabular-nums">$12,430</p>
  <p className="text-xs text-green-600 mt-2">↑ 12% from last month</p>
</div>
```

**Data Table:**
```jsx
<div className="rounded-lg border overflow-hidden">
  <table className="w-full text-sm">
    <thead className="bg-muted/50">
      <tr>{columns.map(col => <th className="px-4 py-3 text-left font-medium text-muted-foreground">{col}</th>)}</tr>
    </thead>
    <tbody className="divide-y">
      {rows.map(row => <tr className="hover:bg-muted/30 transition-colors">{...}</tr>)}
    </tbody>
  </table>
</div>
```

**Empty State:**
```jsx
<div className="flex flex-col items-center justify-center py-16 text-center">
  <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
    {icon}
  </div>
  <h3 className="font-semibold mb-2">No items yet</h3>
  <p className="text-sm text-muted-foreground mb-6 max-w-xs">Description of what this section is for.</p>
  <button className="px-4 py-2 bg-primary text-white rounded-lg text-sm">Add First Item</button>
</div>
```

**Form Pattern:**
```jsx
// Label above input, always
<div className="space-y-2">
  <label className="text-sm font-medium">Field Name</label>
  <input className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
  {error && <p className="text-xs text-red-500">{error}</p>}
</div>
```

## State Management
- Local UI state: `useState`
- Complex app state: `useReducer` with an action map
- Persistence: `localStorage` with a custom hook (`useLocalStorage<T>(key, defaultValue)`)
- Shared state: React context for user/settings, NOT for frequently-updating data

## Loading & Error States
Every data-fetching view needs all 3:
```jsx
if (loading) return <SkeletonList count={5} />   // skeleton, not spinner
if (error) return <ErrorState message={error} onRetry={refetch} />
return <DataView data={data} />
```

## Responsive Behavior
- Sidebar collapses to bottom tab bar on mobile (`hidden md:flex` sidebar, `flex md:hidden` bottom nav)
- Tables become card lists on mobile
- Form columns stack vertically on mobile

## Persistence Pattern
```ts
function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? '') ?? initial }
    catch { return initial }
  })
  const set = (v: T) => { setValue(v); localStorage.setItem(key, JSON.stringify(v)) }
  return [value, set] as const
}
```

## LAYOUT PATTERNS — USE THESE FOR RICHER UX

### Sticky Sidebar with Scrollable Main
For dashboards, docs, settings — sidebar stays anchored, content scrolls independently.
```tsx
<div className="flex h-screen overflow-hidden">
  {/* Sticky sidebar */}
  <aside className="w-60 shrink-0 h-full flex flex-col border-r overflow-y-auto">
    <div className="p-4 border-b sticky top-0 bg-background z-10">
      <span className="font-bold">{brand}</span>
    </div>
    <nav className="flex-1 p-3 space-y-1">{/* nav links */}</nav>
    <div className="p-3 border-t">{/* bottom items */}</div>
  </aside>
  {/* Scrollable main — sidebar never moves */}
  <main className="flex-1 overflow-y-auto">
    <div className="max-w-4xl mx-auto p-6">{/* page content */}</div>
  </main>
</div>
```

### Tabbed Content
For multi-view dashboards, settings pages, data categories.
```tsx
const [tab, setTab] = useState(tabs[0].id)
<div className="flex flex-col gap-6">
  <div className="flex gap-1 border-b">
    {tabs.map(t => (
      <button key={t.id} onClick={() => setTab(t.id)}
        className={cn('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
          tab === t.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
        {t.label}
      </button>
    ))}
  </div>
  <AnimatePresence mode="wait">
    <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
      {tabs.find(t => t.id === tab)?.content}
    </motion.div>
  </AnimatePresence>
</div>
```

### Accordion — Settings & Info Sections
For settings groups, collapsible detail panels, step-by-step guides.
```tsx
const [open, setOpen] = useState<string | null>(null)
{sections.map(s => (
  <div key={s.id} className="border rounded-xl overflow-hidden">
    <button onClick={() => setOpen(open === s.id ? null : s.id)}
      className="flex items-center justify-between w-full p-4 text-left hover:bg-muted/40 transition-colors">
      <div className="flex items-center gap-3">
        <s.icon className="w-4 h-4 text-muted-foreground" />
        <span className="font-medium text-sm">{s.title}</span>
      </div>
      <motion.div animate={{ rotate: open === s.id ? 180 : 0 }} transition={{ duration: 0.2 }}>
        <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
      </motion.div>
    </button>
    <AnimatePresence initial={false}>
      {open === s.id && (
        <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }}
          exit={{ height: 0 }} transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="overflow-hidden border-t">
          <div className="p-4">{s.content}</div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
))}
```

### Pricing Cards (for in-app upgrade/billing dialogs ONLY — not for marketing pages)
```tsx
{/* Use 2-col on most screens; featured plan breaks out visually, not by column count */}
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
  {plans.map(plan => (
    <div key={plan.id} className={cn(
      'rounded-2xl border p-6 flex flex-col gap-4 transition-shadow',
      plan.featured
        ? 'border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20 sm:scale-[1.03]'
        : 'hover:border-primary/30'
    )}>
      {plan.featured && (
        <span className="text-xs font-semibold uppercase tracking-widest opacity-70">Most Popular</span>
      )}
      <div>
        <p className="font-semibold">{plan.name}</p>
        <p className="text-3xl font-black mt-1 tabular-nums">
          {plan.price}
          <span className={cn('text-sm font-normal', plan.featured ? 'opacity-70' : 'text-muted-foreground')}>/mo</span>
        </p>
      </div>
      <ul className="space-y-2 flex-1 text-sm">
        {plan.features.map(f => (
          <li key={f} className="flex gap-2 items-start">
            <CheckIcon className={cn('w-4 h-4 shrink-0 mt-0.5', plan.featured ? 'opacity-80' : 'text-primary')} />
            {f}
          </li>
        ))}
      </ul>
      <button className={cn(
        'w-full py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-90',
        plan.featured ? 'bg-white text-primary' : 'bg-primary text-primary-foreground'
      )}>
        {plan.cta}
      </button>
    </div>
  ))}
</div>
```
**Note:** 3-col pricing is banned everywhere (same as the website pack). Use 2-col max. Featured plan breaks out with `scale-[1.03]` + background flip — NOT with an extra column.

## Anti-Patterns to Avoid
- No prop drilling past 2 levels — use context
- No `any` type — define interfaces for all data shapes
- No loading spinner for <200ms operations — use skeleton screens
- No non-paginated tables with 50+ rows — always paginate or virtualize
- No inline styles — Tailwind only

## MOTION & ANIMATION

framer-motion is pre-installed. Use it for all animations. Import: `import { motion, AnimatePresence, useInView } from 'framer-motion'`

**Hero entrance (always use this on every hero):**
```tsx
const heroVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.25, 0.1, 0, 1] } }
}
<motion.div variants={heroVariants} initial="hidden" animate="visible">
```

**Scroll reveal (use on every section below the hero):**
```tsx
function FadeInSection({ children }: { children: React.ReactNode }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 32 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, ease: 'easeOut' }}>
      {children}
    </motion.div>
  )
}
```

**Stagger children (for card grids, feature lists):**
```tsx
const container = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }
const item = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } }
<motion.ul variants={container} initial="hidden" animate="visible">
  {items.map(i => <motion.li key={i.id} variants={item}>...)
</motion.ul>
```

**Hover lift (cards, buttons, image blocks):**
```tsx
<motion.div whileHover={{ y: -4, transition: { duration: 0.2 } }} whileTap={{ scale: 0.98 }}>
```

**Rules:**
- ALWAYS add hero entrance animation — no static hero ever
- ALWAYS wrap sections in FadeInSection for scroll reveal
- Use stagger on any repeating element group (cards, features, menu items, testimonials)
- Keep easing curves sophisticated: `[0.25, 0.1, 0, 1]` (ease-out) or `[0.43, 0.13, 0.23, 0.96]` (snappy)
- `motionIntensity` from the brief controls scale: subtle = duration 0.6/y:20, moderate = duration 0.8/y:32, dramatic = duration 1.0/y:60 with spring physics
