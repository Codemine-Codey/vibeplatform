import Link from 'next/link'
import { Zap } from 'lucide-react'

export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.08] bg-[#04060f]">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xs">
            <Link href="/home" className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-md shadow-blue-900/40">
                <Zap className="size-4" />
              </span>
              <span className="text-lg font-semibold tracking-tight text-white">Codemine</span>
            </Link>
            <p className="mt-3 text-sm text-neutral-400">
              Describe it, and Codemine builds a real, deployed web app — no setup, no boilerplate.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            <FooterCol
              title="Product"
              links={[
                { label: 'Start building', href: '/signup' },
                { label: 'How it works', href: '/home#how' },
                { label: 'Pricing', href: '/pricing' },
              ]}
            />
            <FooterCol
              title="Company"
              links={[
                { label: 'About', href: '/about' },
                { label: 'Sign in', href: '/login' },
                { label: 'Contact', href: 'mailto:hello@codemine.app' },
              ]}
            />
            <FooterCol
              title="Legal"
              links={[
                { label: 'Terms & Conditions', href: '/terms' },
                { label: 'Privacy Policy', href: '/privacy' },
              ]}
            />
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/[0.08] pt-6 text-sm text-neutral-500 sm:flex-row">
          <p>© {new Date().getFullYear()} Codemine. All rights reserved.</p>
          <p>Built with Codemine.</p>
        </div>
      </div>
    </footer>
  )
}

function FooterCol({
  title,
  links,
}: {
  title: string
  links: { label: string; href: string }[]
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-white">{title}</h4>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.label}>
            <Link
              href={l.href}
              className="text-sm text-neutral-400 transition-colors hover:text-white"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
