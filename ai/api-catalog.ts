// Curated catalog of free, CORS-enabled public APIs for AI-generated webapps.
// All entries are: free to use, no billing required, browser-accessible (CORS headers set),
// and stable enough to rely on in generated apps. Injected into the generation system prompt
// for 'webapp' skill builds so the AI produces apps with REAL data instead of mock arrays.
//
// Selection criteria:
//   - CORS-enabled (works from browser JS without a proxy)
//   - Free tier with no credit card required (API key is optional or trivially obtainable)
//   - Documented, stable, and widely used
//   - Returns JSON

export interface ApiEntry {
  name: string
  baseUrl: string
  description: string
  exampleEndpoint: string
  exampleDescription: string
  requiresKey: boolean
  keyNote?: string       // how to get the key if requiresKey=true
  category: string
}

export const API_CATALOG: ApiEntry[] = [
  // ── Weather ───────────────────────────────────────────────────────────────
  {
    name: 'Open-Meteo',
    baseUrl: 'https://api.open-meteo.com/v1',
    description: 'Free weather API with current conditions and forecasts. No API key needed.',
    exampleEndpoint: 'https://api.open-meteo.com/v1/forecast?latitude=51.5&longitude=-0.12&current=temperature_2m,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto',
    exampleDescription: 'Current temperature and 7-day forecast for London',
    requiresKey: false,
    category: 'weather',
  },
  // ── Finance / Crypto ──────────────────────────────────────────────────────
  {
    name: 'CoinGecko',
    baseUrl: 'https://api.coingecko.com/api/v3',
    description: 'Real-time and historical crypto prices, market cap, volume. No key needed for public endpoints.',
    exampleEndpoint: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1',
    exampleDescription: 'Top 10 cryptocurrencies by market cap with prices',
    requiresKey: false,
    category: 'finance',
  },
  {
    name: 'ExchangeRate-API (free tier)',
    baseUrl: 'https://open.er-api.com/v6',
    description: 'Currency exchange rates. Free tier — no sign-up needed for open endpoint.',
    exampleEndpoint: 'https://open.er-api.com/v6/latest/USD',
    exampleDescription: 'Live USD exchange rates against all currencies',
    requiresKey: false,
    category: 'finance',
  },
  // ── News ──────────────────────────────────────────────────────────────────
  {
    name: 'HackerNews (via Algolia)',
    baseUrl: 'https://hn.algolia.com/api/v1',
    description: 'Full HackerNews search API. No key required. CORS enabled.',
    exampleEndpoint: 'https://hn.algolia.com/api/v1/search?query=startup&tags=story&hitsPerPage=10',
    exampleDescription: 'Top HackerNews stories matching "startup"',
    requiresKey: false,
    category: 'news',
  },
  // ── Food & Recipes ────────────────────────────────────────────────────────
  {
    name: 'TheMealDB',
    baseUrl: 'https://www.themealdb.com/api/json/v1/1',
    description: 'Free recipe and meal database. No key required for public tier.',
    exampleEndpoint: 'https://www.themealdb.com/api/json/v1/1/search.php?s=pasta',
    exampleDescription: 'Search recipes by name — returns ingredients, instructions, and thumbnail',
    requiresKey: false,
    category: 'food',
  },
  {
    name: 'OpenFoodFacts',
    baseUrl: 'https://world.openfoodfacts.org/api/v2',
    description: 'Open database of food products with nutrition data. No key needed.',
    exampleEndpoint: 'https://world.openfoodfacts.org/api/v2/product/3017620422003.json',
    exampleDescription: 'Full nutrition data for Nutella (by barcode)',
    requiresKey: false,
    category: 'food',
  },
  // ── Geography / Countries ─────────────────────────────────────────────────
  {
    name: 'RestCountries',
    baseUrl: 'https://restcountries.com/v3.1',
    description: 'Country data — flag, population, capital, languages, currencies. No key.',
    exampleEndpoint: 'https://restcountries.com/v3.1/all?fields=name,capital,population,flags,region',
    exampleDescription: 'All countries with name, capital, population, flag, and region',
    requiresKey: false,
    category: 'geography',
  },
  // ── Books & Literature ────────────────────────────────────────────────────
  {
    name: 'Open Library',
    baseUrl: 'https://openlibrary.org',
    description: 'Book search and metadata from the Internet Archive. No key needed.',
    exampleEndpoint: 'https://openlibrary.org/search.json?q=tolkien&fields=title,author_name,first_publish_year,cover_i&limit=10',
    exampleDescription: 'Search books by author or title — returns cover image ID, year, authors',
    requiresKey: false,
    category: 'books',
  },
  // ── Quotes ────────────────────────────────────────────────────────────────
  {
    name: 'ZenQuotes',
    baseUrl: 'https://zenquotes.io/api',
    description: 'Random inspirational quotes. No key. Returns array of {q, a} objects.',
    exampleEndpoint: 'https://zenquotes.io/api/quotes',
    exampleDescription: 'Fetch 50 random inspirational quotes with author names',
    requiresKey: false,
    category: 'quotes',
  },
  // ── Dictionary / Language ─────────────────────────────────────────────────
  {
    name: 'Free Dictionary API',
    baseUrl: 'https://api.dictionaryapi.dev/api/v2',
    description: 'Word definitions, phonetics, examples, and audio pronunciations. No key.',
    exampleEndpoint: 'https://api.dictionaryapi.dev/api/v2/entries/en/serendipity',
    exampleDescription: 'Full definition of "serendipity" with phonetics and examples',
    requiresKey: false,
    category: 'language',
  },
  // ── Entertainment ─────────────────────────────────────────────────────────
  {
    name: 'PokeAPI',
    baseUrl: 'https://pokeapi.co/api/v2',
    description: 'Complete Pokémon data — stats, sprites, moves, evolutions. No key.',
    exampleEndpoint: 'https://pokeapi.co/api/v2/pokemon?limit=20&offset=0',
    exampleDescription: 'First 20 Pokémon with links to their full data',
    requiresKey: false,
    category: 'entertainment',
  },
  {
    name: 'TMDB (The Movie Database)',
    baseUrl: 'https://api.themoviedb.org/3',
    description: 'Movies, TV shows, cast, trailers. Free API key — sign up at themoviedb.org.',
    exampleEndpoint: 'https://api.themoviedb.org/3/movie/popular?api_key=YOUR_KEY&language=en-US&page=1',
    exampleDescription: 'Popular movies with posters (prefix poster_path with https://image.tmdb.org/t/p/w500)',
    requiresKey: true,
    keyNote: 'Free at https://www.themoviedb.org/signup — takes 30 seconds, no billing.',
    category: 'entertainment',
  },
  // ── Sports ────────────────────────────────────────────────────────────────
  {
    name: 'Ball Don\'t Lie (NBA)',
    baseUrl: 'https://api.balldontlie.io/v1',
    description: 'NBA stats — players, teams, games, season averages. Free tier, no billing.',
    exampleEndpoint: 'https://api.balldontlie.io/v1/players?search=james',
    exampleDescription: 'Search NBA players by name — returns stats and team info',
    requiresKey: true,
    keyNote: 'Free key at https://www.balldontlie.io — instant, no billing.',
    category: 'sports',
  },
  // ── Science & Space ───────────────────────────────────────────────────────
  {
    name: 'NASA APOD',
    baseUrl: 'https://api.nasa.gov',
    description: 'NASA Astronomy Picture of the Day with explanation and HD image. Free key.',
    exampleEndpoint: 'https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&count=5',
    exampleDescription: '5 random astronomy images with descriptions (use DEMO_KEY for testing)',
    requiresKey: true,
    keyNote: 'DEMO_KEY works for low-volume requests. Free key at https://api.nasa.gov.',
    category: 'science',
  },
  // ── Placeholder / Mock ────────────────────────────────────────────────────
  {
    name: 'JSONPlaceholder',
    baseUrl: 'https://jsonplaceholder.typicode.com',
    description: 'Fake REST API for prototyping — posts, users, todos, comments. No key.',
    exampleEndpoint: 'https://jsonplaceholder.typicode.com/posts',
    exampleDescription: '100 fake blog posts — useful for prototyping list/detail UI patterns',
    requiresKey: false,
    category: 'placeholder',
  },
  // ── Images ────────────────────────────────────────────────────────────────
  {
    name: 'Picsum Photos',
    baseUrl: 'https://picsum.photos',
    description: 'Random high-quality placeholder images by size. No key. Returns image directly.',
    exampleEndpoint: 'https://picsum.photos/800/600',
    exampleDescription: 'Random 800×600 image. Add ?random=N for a specific seed.',
    requiresKey: false,
    category: 'images',
  },
]

// Return the catalog entries most relevant to a project brief.
// Used to inject only relevant APIs (not the entire catalog) into the system prompt.
export function selectRelevantApis(
  userPrompt: string,
  features: string[],
  maxEntries = 6
): ApiEntry[] {
  const text = (userPrompt + ' ' + features.join(' ')).toLowerCase()

  const scores = new Map<ApiEntry, number>()

  const keywords: Record<string, string[]> = {
    weather: ['weather', 'temperature', 'forecast', 'climate', 'rain', 'wind', 'storm'],
    finance: ['crypto', 'bitcoin', 'currency', 'exchange', 'price', 'stock', 'market', 'trading', 'wallet', 'coin', 'financial'],
    news: ['news', 'articles', 'blog', 'stories', 'feed', 'hacker', 'tech news'],
    food: ['recipe', 'food', 'meal', 'restaurant', 'cooking', 'ingredients', 'nutrition', 'diet'],
    geography: ['country', 'countries', 'map', 'flag', 'capital', 'world', 'travel', 'globe', 'population'],
    books: ['book', 'library', 'reading', 'literature', 'author', 'novel', 'isbn'],
    quotes: ['quote', 'inspiration', 'motivation', 'wisdom', 'saying'],
    language: ['dictionary', 'word', 'definition', 'language', 'vocabulary', 'meaning'],
    entertainment: ['movie', 'film', 'tv', 'pokemon', 'game', 'anime', 'entertainment', 'series', 'show'],
    sports: ['sport', 'nba', 'basketball', 'player', 'team', 'score', 'game', 'stats'],
    science: ['space', 'nasa', 'astronomy', 'planet', 'science', 'universe', 'star', 'galaxy'],
    placeholder: ['todo', 'list', 'dashboard', 'admin', 'crud', 'posts', 'users', 'comments'],
    images: ['photo', 'image', 'gallery', 'picture', 'portfolio'],
  }

  for (const entry of API_CATALOG) {
    const cats = keywords[entry.category] ?? []
    let score = cats.filter(kw => text.includes(kw)).length
    // Prefer no-key APIs to keep generated apps immediately functional
    if (!entry.requiresKey) score += 0.5
    if (score > 0) scores.set(entry, score)
  }

  // Always include at least one placeholder for pure UI apps
  if (scores.size === 0) {
    const placeholder = API_CATALOG.find(a => a.category === 'placeholder')
    if (placeholder) scores.set(placeholder, 0.1)
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxEntries)
    .map(([entry]) => entry)
}

// Format selected APIs into a compact system-prompt section.
export function buildApiCatalogPrompt(apis: ApiEntry[]): string {
  if (apis.length === 0) return ''
  const lines = [
    '## AVAILABLE FREE PUBLIC APIS',
    'Use these real APIs in your generated app instead of mock/hardcoded data.',
    'All are CORS-enabled and can be called directly from browser JavaScript.',
    '',
  ]
  for (const api of apis) {
    lines.push(`### ${api.name} — ${api.description}`)
    lines.push(`Base URL: ${api.baseUrl}`)
    lines.push(`Example: ${api.exampleEndpoint}`)
    lines.push(`         → ${api.exampleDescription}`)
    if (api.requiresKey && api.keyNote) {
      lines.push(`API Key: ${api.keyNote}`)
      lines.push(`         Show a clear input field so the user can paste their own key (store in localStorage).`)
    }
    lines.push('')
  }
  lines.push('IMPORTANT: call fetch() directly in useEffect or event handlers. Do NOT use axios unless already in package.json. Handle loading + error states visually.')
  return lines.join('\n')
}
