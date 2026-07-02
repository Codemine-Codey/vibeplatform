import Link from 'next/link'
import { Logo } from '@/components/ui/logo'

export function SiteFooter() {
  return (
    <footer className="cm-footer border-t border-[var(--cm-border)] bg-[var(--cm-wash)]">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xs">
            <Link href="/home" className="flex items-center gap-2">
              <Logo className="size-8" />
              <span className="text-lg font-semibold tracking-tight text-[var(--cm-heading)]">
                Codemine
              </span>
            </Link>
            <p className="mt-3 text-sm text-[var(--cm-muted)]">
              Describe your idea, and Codemine writes it, runs it, and ships it live, in minutes.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-4">
            <FooterCol
              title="Product"
              links={[
                { label: 'Start building', href: '/signup' },
                { label: 'How it works', href: '/home#how' },
                { label: 'Pricing', href: '/pricing' },
              ]}
            />
            <FooterCol
              title="Resources"
              links={[
                { label: 'Blog', href: '/blog' },
                { label: 'Guides', href: '/guides' },
                { label: 'FAQ', href: '/faq' },
              ]}
            />
            <FooterCol
              title="Company"
              links={[
                { label: 'About', href: '/about' },
                { label: 'Sign in', href: '/login' },
                { label: 'Contact', href: '/contact' },
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

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-[var(--cm-border)] pt-6 text-sm text-[var(--cm-faint)] sm:flex-row">
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
      <h4 className="text-sm font-semibold text-[var(--cm-heading)]">{title}</h4>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.label}>
            <Link
              href={l.href}
              className="text-sm text-[var(--cm-muted)] transition-colors hover:text-[var(--cm-heading)]"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
