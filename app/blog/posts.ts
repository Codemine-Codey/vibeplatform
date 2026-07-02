// Blog content — SEO-oriented, brand-neutral (no competitor mentions). Placeholder-quality copy
// to fill out later; each post is a few real sections so the pages read as complete.
export interface Post {
  slug: string
  title: string
  description: string
  date: string
  readMins: number
  tag: string
  body: { heading?: string; text: string }[]
}

export const POSTS: Post[] = [
  {
    slug: 'build-a-website-without-writing-code',
    title: 'How to Build a Website Without Writing Code',
    description:
      'You do not need to be a developer to launch a real website. Here is how describing what you want turns into a live, deployed site in minutes.',
    date: '2026-06-28',
    readMins: 4,
    tag: 'Guides',
    body: [
      {
        text: 'For years, building a website meant choosing a stack, wrestling with templates, and hiring help the moment you wanted something custom. That is changing. With an AI builder like Codemine, you describe the site you want in plain English and get a real, working website — not a locked template — that you can refine and publish.',
      },
      {
        heading: 'Start with a sentence, not a setup',
        text: 'The hardest part of any project used to be getting started: installing tools, configuring a framework, wiring up hosting. With Codemine you skip all of it. You type what you want — “a clean website for my bakery with photos of my cakes and a way to order” — and the build begins immediately. No accounts to connect, no boilerplate to copy.',
      },
      {
        heading: 'Refine by chatting',
        text: 'Your first version is a starting point. Want a warmer color, a new page, or a contact form? Just ask. Each change is applied and you see it live, so shaping the site feels like a conversation rather than a coding task.',
      },
      {
        heading: 'Publish to a real URL',
        text: 'When it looks right, one click puts your site online at a real address you can share. It is genuine code on genuine hosting — so it is fast, reliable, and yours to grow.',
      },
    ],
  },
  {
    slug: 'idea-to-live-web-app-in-minutes',
    title: 'From Idea to a Live Web App in Minutes',
    description:
      'Turning an idea into a working, deployed web app used to take weeks. Here is why it now takes minutes — and what that means for creators and founders.',
    date: '2026-06-25',
    readMins: 5,
    tag: 'Product',
    body: [
      {
        text: 'Every great product starts as an idea in someone’s head. The gap between that idea and something people can actually use has always been the bottleneck. AI web builders close that gap dramatically — you can go from a description to a live, working app in a single sitting.',
      },
      {
        heading: 'What “working” really means',
        text: 'A real app is more than a pretty page. It needs state, logic, and often a place to store data. Codemine handles the whole loop: it writes the code, runs it, and — when your app needs it — wires up a database, sign-in, and storage automatically, so features actually work instead of just looking like they might.',
      },
      {
        heading: 'Iterate at the speed of thought',
        text: 'Because changes happen through chat and apply instantly, you can try ten variations of an idea in the time it once took to set up one. That tight loop is where good products are found — you follow what feels right instead of committing to a plan up front.',
      },
      {
        heading: 'Ship, then keep going',
        text: 'One click deploys your app to a live URL. From there you can add pages, connect a custom domain, and keep refining. The idea in your head is now a thing in the world — and it only took minutes to get there.',
      },
    ],
  },
  {
    slug: 'do-you-need-to-code-to-build-an-app',
    title: 'Do You Need to Know How to Code to Build an App?',
    description:
      'Short answer: no. Here is what actually matters when you build with AI — and where a bit of technical curiosity still helps.',
    date: '2026-06-20',
    readMins: 4,
    tag: 'Insights',
    body: [
      {
        text: 'It is the question we hear most: do I need to be technical to build something real? For a long time the honest answer was “mostly, yes.” Today it is a clear no — but it is worth understanding why, and where knowing a little still pays off.',
      },
      {
        heading: 'The AI writes the code — you make the decisions',
        text: 'With an AI builder, the coding is handled for you. Your job shifts to the things only you can do: knowing what you want, judging whether it looks and feels right, and deciding what to change. Those are creative and product decisions, not technical ones.',
      },
      {
        heading: 'Clear descriptions beat clever ones',
        text: 'The best results come from describing your idea plainly and specifically — who it is for, what it should do, and the vibe you want. You do not need jargon. “A calm, minimal habit tracker where I tap to mark a day done and see a streak” gets you further than any technical spec.',
      },
      {
        heading: 'A little curiosity goes a long way',
        text: 'You will never need to write code — but being curious about how your app behaves helps you ask better questions and push it further. The tools handle the how; you bring the what and the why.',
      },
    ],
  },
]

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug)
}
