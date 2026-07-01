import type { Metadata } from 'next'
import { Landing } from '@/components/marketing/landing'

export const metadata: Metadata = {
  title: 'Codemine — Prompt to a live web app',
  description:
    'Describe what you want to build and Codemine turns it into a real, deployed web app in minutes. Instant preview, one-click deploy, built-in database and auth.',
}

export default function HomePage() {
  return <Landing />
}
