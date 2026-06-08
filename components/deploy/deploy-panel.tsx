'use client'

import {
  RocketIcon,
  GlobeIcon,
  HammerIcon,
  UploadCloudIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  AlertCircleIcon,
} from 'lucide-react'
import { useSandboxStore } from '@/app/state'
import { cn } from '@/lib/utils'

interface Props {
  className?: string
}

export function DeployPanel({ className }: Props) {
  const sandboxId = useSandboxStore((s) => s.sandboxId)
  const deployStatus = useSandboxStore((s) => s.deployStatus)
  const deployedUrl = useSandboxStore((s) => s.deployedUrl)
  const deployError = useSandboxStore((s) => s.deployError)
  const setDeployState = useSandboxStore((s) => s.setDeployState)
  const chatStatus = useSandboxStore((s) => s.chatStatus)
  const paths = useSandboxStore((s) => s.paths)

  const hasFiles = paths.length > 0
  const aiWorking = chatStatus === 'streaming' || chatStatus === 'submitted'

  async function handleDeploy() {
    if (!sandboxId) return
    setDeployState({ deployStatus: 'building', deployError: undefined })
    try {
      setDeployState({ deployStatus: 'building' })
      const res = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandboxId }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Deployment failed')
      }
      setDeployState({ deployStatus: 'deploying' })
      const data = await res.json() as { url: string; projectName: string }
      setDeployState({ deployStatus: 'done', deployedUrl: data.url, deployProjectName: data.projectName })
    } catch (err) {
      setDeployState({
        deployStatus: 'error',
        deployError: err instanceof Error ? err.message : 'Deployment failed',
      })
    }
  }

  const isDeployIdle = deployStatus === 'idle' || deployStatus === 'error' || deployStatus === undefined
  const canDeploy = !!sandboxId && isDeployIdle

  return (
    <div className={cn('flex flex-col h-full bg-background border border-primary/18 rounded-sm', className)}>
      <div className="flex flex-col items-center justify-center flex-1 gap-4 p-6">
        {/* Idle / Error — show deploy button */}
        {canDeploy && (
          <div className="flex flex-col items-center gap-3 text-center">
            {deployStatus === 'error' && deployError && (
              <div className="flex items-center gap-2 text-destructive text-sm max-w-xs text-center">
                <AlertCircleIcon className="w-4 h-4 shrink-0" />
                <span>{deployError}</span>
              </div>
            )}
            {!sandboxId && (
              <p className="text-muted-foreground text-sm">Generate a project first to enable deployment.</p>
            )}
            {sandboxId && (
              <>
                <div className="flex flex-col items-center gap-1">
                  <RocketIcon className="w-8 h-8 text-muted-foreground mb-1" />
                  <p className="text-sm font-medium">Deploy to Cloudflare Pages</p>
                  <p className="text-xs text-muted-foreground">
                    {aiWorking
                      ? 'Waiting for generation to complete...'
                      : !hasFiles
                      ? 'Project files not ready yet'
                      : 'Build your project and publish it live'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDeploy}
                  disabled={aiWorking || !hasFiles}
                  className="flex items-center gap-2 px-4 py-2 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deployStatus === 'error' ? (
                    <>
                      <RefreshCwIcon className="w-4 h-4" />
                      Retry Deploy
                    </>
                  ) : (
                    <>
                      <RocketIcon className="w-4 h-4" />
                      Deploy
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        )}

        {/* Building state */}
        {deployStatus === 'building' && (
          <div className="flex flex-col items-center gap-3 text-center">
            <HammerIcon className="w-8 h-8 text-muted-foreground animate-pulse" />
            <p className="text-sm font-medium">Building project...</p>
            <p className="text-xs text-muted-foreground">This may take up to 90 seconds</p>
          </div>
        )}

        {/* Deploying state */}
        {deployStatus === 'deploying' && (
          <div className="flex flex-col items-center gap-3 text-center">
            <UploadCloudIcon className="w-8 h-8 text-muted-foreground animate-pulse" />
            <p className="text-sm font-medium">Uploading to Cloudflare...</p>
            <p className="text-xs text-muted-foreground">Publishing your site</p>
          </div>
        )}

        {/* Done state */}
        {deployStatus === 'done' && deployedUrl && (
          <div className="flex flex-col items-center gap-4 text-center w-full max-w-sm">
            <div className="flex flex-col items-center gap-1">
              <GlobeIcon className="w-8 h-8 text-foreground mb-1" />
              <p className="text-sm font-medium">Deployed!</p>
              <p className="text-xs text-muted-foreground">Your project is live at</p>
            </div>
            <a
              href={deployedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-foreground underline underline-offset-2 hover:opacity-70 transition-opacity break-all"
            >
              {deployedUrl}
            </a>
            <div className="flex items-center gap-2">
              <a
                href={deployedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-primary/20 text-xs hover:bg-accent transition-colors"
              >
                <ExternalLinkIcon className="w-3 h-3" />
                Open
              </a>
              <button
                type="button"
                onClick={handleDeploy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-primary/20 text-xs hover:bg-accent transition-colors"
              >
                <RefreshCwIcon className="w-3 h-3" />
                Redeploy
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
