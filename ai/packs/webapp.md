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

## Anti-Patterns to Avoid
- No prop drilling past 2 levels — use context
- No `any` type — define interfaces for all data shapes
- No loading spinner for <200ms operations — use skeleton screens
- No non-paginated tables with 50+ rows — always paginate or virtualize
- No inline styles — Tailwind only
