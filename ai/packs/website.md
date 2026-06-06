# Website Skill Pack — Design & Code Patterns

## Layout Structure
- Sticky/fixed nav → transparent, frosted glass on scroll (`backdrop-blur-md bg-white/80`)
- Hero section first: full-width, display heading (`text-6xl` to `text-8xl`), subheading, 1–2 CTAs
- Alternating content blocks (image left / text right, then flip) — never stack identical layouts
- Footer: multi-column links, social icons, copyright line

## Typography Rules
- Display headings: use the brief's display font, `font-bold` or `font-black`, tight tracking (`tracking-tight`)
- Body: clean readable size (`text-base` to `text-lg`), `leading-relaxed`
- Section labels: small uppercase mono (`text-xs tracking-widest uppercase opacity-60`) above headings
- Never use default system fonts — always apply the brief's fontPairing via Google Fonts

## Color Application
- Map brief's colorPalette to CSS custom properties in `:root` — never hardcode hex everywhere
- Primary CTA: most saturated brand color, white text
- Secondary CTA: outlined, transparent bg
- Section backgrounds: alternate between white, light tint of primary, and dark (for contrast sections)
- Text on dark backgrounds: pure white for headings, `text-white/80` for body

## Component Patterns

**Hero:**
```jsx
// Full viewport height, centered content, background image or gradient
<section className="relative min-h-screen flex items-center">
  <div className="max-w-7xl mx-auto px-6 py-24">
    <p className="text-xs tracking-widest uppercase opacity-60 mb-4">Label</p>
    <h1 className="text-7xl font-black tracking-tight leading-none mb-6">Headline</h1>
    <p className="text-xl text-foreground/70 max-w-2xl mb-10">Subheading</p>
    <div className="flex gap-4">
      <button className="px-8 py-4 bg-primary text-white rounded-full font-semibold">Primary CTA</button>
      <button className="px-8 py-4 border border-current rounded-full">Secondary</button>
    </div>
  </div>
</section>
```

**Feature Grid:**
```jsx
// 3-column grid on desktop, stacked on mobile
<div className="grid grid-cols-1 md:grid-cols-3 gap-8">
  {features.map(f => (
    <div className="p-8 rounded-2xl border bg-card hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
        {f.icon}
      </div>
      <h3 className="text-xl font-semibold mb-3">{f.title}</h3>
      <p className="text-foreground/60 leading-relaxed">{f.description}</p>
    </div>
  ))}
</div>
```

**Testimonial:**
```jsx
<div className="p-8 rounded-2xl bg-secondary">
  <p className="text-lg leading-relaxed mb-6 italic">"{quote}"</p>
  <div className="flex items-center gap-4">
    <img src={avatar} className="w-12 h-12 rounded-full object-cover" />
    <div><p className="font-semibold">{name}</p><p className="text-sm opacity-60">{role}</p></div>
  </div>
</div>
```

## Images
- ALWAYS call `get_unsplash` for hero images, section backgrounds, and team photos
- Query should match the brand: "luxury spa interior", "modern software team", not just "people"
- Use `object-cover` on all images, always set explicit height

## Animations
- Hover on cards: `hover:-translate-y-1 hover:shadow-xl transition-all duration-300`
- Buttons: `hover:scale-105 active:scale-95 transition-transform`
- Sections fade in: add `animate-in fade-in slide-in-from-bottom-4 duration-700` on section entry
- Never use JS animation libraries — CSS transitions only for performance

## Navigation
- Mobile: hamburger menu, full-screen overlay or slide-in drawer
- Desktop: horizontal links, CTA button right-aligned
- Active state: underline or color change on current section
- Smooth scroll: `scroll-behavior: smooth` on html element, anchor links

## Multi-Page Structure (React Router)
- `/` — Home (Hero + all sections)
- `/about` — Story, team, values
- `/services` or `/work` — Portfolio or service detail
- `/contact` — Contact form
- Shared: `<Layout>` with Nav + Footer wrapping all pages

## Anti-Patterns to Avoid
- No full-page loading spinners for a static site
- No Lorem Ipsum — write real placeholder copy matching the brand
- No stock blue/grey unless brief explicitly calls for it
- No inaccessible contrast (text must pass WCAG AA)
- No images without alt text
