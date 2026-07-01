import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { ChatProvider } from '@/lib/chat-context'
import { CommandLogsStream } from '@/components/commands-logs/commands-logs-stream'
import { ErrorMonitor } from '@/components/error-monitor/error-monitor'
import { SandboxState } from '@/components/modals/sandbox-state'
import { Toaster } from '@/components/ui/sonner'
import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Codemine — Build Anything',
  description: 'Describe what you want to build. Codemine turns your idea into a fully working website, web app, or web game in minutes.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {/* Apply the saved theme before paint so there's no flash of the wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('cm-theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
        <Suspense fallback={null}>
          <NuqsAdapter>
            <ChatProvider>
              <ErrorMonitor>{children}</ErrorMonitor>
            </ChatProvider>
          </NuqsAdapter>
        </Suspense>
        <Toaster />
        <CommandLogsStream />
        <SandboxState />
      </body>
    </html>
  )
}
