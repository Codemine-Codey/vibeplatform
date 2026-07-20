import { Chat } from './chat'
import { FileExplorer } from './file-explorer'
import { Header } from './header'
import { Horizontal } from '@/components/layout/panels'
import { Logs } from './logs'
import { Preview } from './preview'
import { RightPanel } from '@/components/layout/right-panel'
import { CloudDashboard } from '@/components/cloud/cloud-dashboard'
import { MobileTabs } from '@/components/layout/mobile-tabs'
import { TabContent } from '@/components/tabs'
import { Welcome } from '@/components/modals/welcome'
import { SandboxLifecycle } from '@/components/sandbox-lifecycle'
import { ProjectLoader } from '@/components/project-loader'
import { cookies } from 'next/headers'
import { getHorizontal } from '@/components/layout/sizing'
import { hideBanner } from '@/app/actions'

export default async function Page() {
  const store = await cookies()
  const banner = store.get('banner-hidden')?.value !== 'true'
  const horizontalSizes = getHorizontal(store)
  return (
    <>
      <SandboxLifecycle />
      <ProjectLoader />
      <Welcome defaultOpen={banner} onDismissAction={hideBanner} />
      <div className="flex flex-col h-screen max-h-screen overflow-hidden p-2 gap-y-1">
        <Header className="flex items-center w-full" />
        <div className="md:hidden">
          <MobileTabs />
        </div>

        {/* Mobile layout — matches desktop: Chat / Preview / Code / Cloud (unified).
            Logs stays mounted (hidden) so the error-monitor keeps receiving dev-server logs. */}
        <div className="flex flex-1 w-full min-h-0 overflow-hidden pt-2 md:hidden">
          <TabContent tabId="chat" className="flex-1 min-w-0">
            <Chat className="flex-1 overflow-hidden" />
          </TabContent>
          <TabContent tabId="preview" className="flex-1 min-w-0">
            <Preview className="flex-1 overflow-hidden" />
          </TabContent>
          <TabContent tabId="file-explorer" className="flex-1 min-w-0">
            <FileExplorer className="flex-1 overflow-hidden" />
          </TabContent>
          <TabContent tabId="cloud" className="flex-1 min-w-0">
            <CloudDashboard className="flex-1 overflow-hidden" />
          </TabContent>
          {/* Mounted but never shown — feeds the error-monitor. */}
          <div className="hidden">
            <Logs />
          </div>
        </div>

        {/* Desktop layout — 30% chat / 70% tabbed right panel */}
        <div className="hidden flex-1 w-full min-h-0 overflow-hidden pt-2 md:flex">
          <Horizontal
            defaultLayout={horizontalSizes ?? [36, 64]}
            left={<Chat className="flex-1 overflow-hidden" />}
            right={<RightPanel className="flex-1 overflow-hidden" />}
          />
        </div>
      </div>
    </>
  )
}
