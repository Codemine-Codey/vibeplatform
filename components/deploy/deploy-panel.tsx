'use client'

import { useState } from 'react'
import {
  RocketIcon,
  GlobeIcon,
  HammerIcon,
  UploadCloudIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  AlertCircleIcon,
  PlusIcon,
  XIcon,
} from 'lucide-react'
import { useSandboxStore } from '@/app/state'
import { cn } from '@/lib/utils'

interface Props {
  className?: string
}

interface EnvVar {
  key: string
  value: string
}

export function DeployPanel({ className }: Props) {
  const sandboxId = useSandboxStore((s) => s.sandboxId)
  const deployStatus = useSandboxStore((s) => s.deployStatus)
  const deployedUrl = useSandboxStore((s) => s.deployedUrl)
  const deployError = useSandboxStore((s) => s.deployError)
  const deployProjectName = useSandboxStore((s) => s.deployProjectName)
  const setDeployState = useSandboxStore((s) => s.setDeployState)
  const chatStatus = useSandboxStore((s) => s.chatStatus)
  const paths = useSandboxStore((s) => s.paths)

  const hasFiles = paths.length > 0
  const aiWorking = chatStatus === 'streaming' || chatStatus === 'submitted'

  // Custom domain state
  const [domain, setDomain] = useState('')
  const [domainAdding, setDomainAdding] = useState(false)
  const [domainAdded, setDomainAdded] = useState(false)
  const [domainError, setDomainError] = useState<string | undefined>()

  // Env vars state
  const [envVars, setEnvVars] = useState<EnvVar[]>([{ key: '', value: '' }])
  const [envSaving, setEnvSaving] = useState(false)
  const [envSaved, setEnvSaved] = useState(false)
  const [envError, setEnvError] = useState<string | undefined>()

  async function handleDeploy() {
    if (!sandboxId) return
    setDeployState({ deployStatus: 'building', deployError: undefined })
    try {
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

  async function handleAddDomain() {
    if (!domain.trim() || !deployProjectName) return
    setDomainAdding(true)
    setDomainError(undefined)
    setDomainAdded(false)
    try {
      const res = await fetch('/api/deploy/domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: deployProjectName, domain: domain.trim() }),
      })
      const data = await res.json() as { success?: boolean; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to add domain')
      setDomainAdded(true)
    } catch (err) {
      setDomainError(err instanceof Error ? err.message : 'Failed to add domain')
    } finally {
      setDomainAdding(false)
    }
  }

  async function handleSaveEnvVars() {
    if (!deployProjectName) return
    const validVars = envVars.filter((v) => v.key.trim() && v.value.trim())
    if (validVars.length === 0) return
    setEnvSaving(true)
    setEnvError(undefined)
    setEnvSaved(false)
    try {
      const vars: Record<string, string> = {}
      for (const { key, value } of validVars) vars[key.trim()] = value.trim()
      const res = await fetch('/api/deploy/envvars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: deployProjectName, vars }),
      })
      const data = await res.json() as { success?: boolean; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to save')
      setEnvSaved(true)
    } catch (err) {
      setEnvError(err instanceof Error ? err.message : 'Failed to save variables')
    } finally {
      setEnvSaving(false)
    }
  }

  function updateEnvVar(i: number, field: 'key' | 'value', val: string) {
    setEnvVars((prev) => prev.map((v, idx) => (idx === i ? { ...v, [field]: val } : v)))
  }

  function removeEnvVar(i: number) {
    setEnvVars((prev) => prev.filter((_, idx) => idx !== i))
  }

  const isDeployIdle = deployStatus === 'idle' || deployStatus === 'error' || deployStatus === undefined
  const canDeploy = !!sandboxId && isDeployIdle

  return (
    <div className={cn('flex flex-col h-full bg-background border border-primary/18 rounded-sm overflow-auto', className)}>
      {/* Idle / Error */}
      {canDeploy && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 p-6 text-center">
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

      {/* Building */}
      {deployStatus === 'building' && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 p-6 text-center">
          <HammerIcon className="w-8 h-8 text-muted-foreground animate-pulse" />
          <p className="text-sm font-medium">Building project...</p>
          <p className="text-xs text-muted-foreground">This may take up to 90 seconds</p>
        </div>
      )}

      {/* Uploading */}
      {deployStatus === 'deploying' && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 p-6 text-center">
          <UploadCloudIcon className="w-8 h-8 text-muted-foreground animate-pulse" />
          <p className="text-sm font-medium">Uploading to Cloudflare...</p>
          <p className="text-xs text-muted-foreground">Publishing your site</p>
        </div>
      )}

      {/* Done */}
      {deployStatus === 'done' && deployedUrl && (
        <div className="flex flex-col gap-5 p-5">
          {/* Success */}
          <div className="flex flex-col items-center gap-2 text-center">
            <GlobeIcon className="w-7 h-7 text-foreground" />
            <p className="text-sm font-medium">Deployed!</p>
            <a
              href={deployedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-foreground underline underline-offset-2 hover:opacity-70 break-all"
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

          <div className="border-t border-primary/10" />

          {/* Custom Domain */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium">Custom Domain</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={domain}
                onChange={(e) => { setDomain(e.target.value); setDomainAdded(false); setDomainError(undefined) }}
                placeholder="yourdomain.com"
                className="flex-1 text-xs bg-secondary rounded-sm px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={handleAddDomain}
                disabled={!domain.trim() || domainAdding}
                className="px-3 py-1.5 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 disabled:opacity-50"
              >
                {domainAdding ? 'Adding...' : 'Add'}
              </button>
            </div>
            {domainAdded && (
              <p className="text-xs text-muted-foreground">
                Domain added — point a <code className="font-mono">CNAME</code> record to{' '}
                <code className="font-mono">{deployProjectName}.pages.dev</code> at your registrar
              </p>
            )}
            {domainError && <p className="text-xs text-destructive">{domainError}</p>}
          </div>

          <div className="border-t border-primary/10" />

          {/* Environment Variables */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium">Environment Variables</p>
            <p className="text-xs text-muted-foreground -mt-1">
              Injected as <code className="font-mono">VITE_*</code> — accessible in your app via <code className="font-mono">import.meta.env</code>
            </p>
            <div className="flex flex-col gap-1.5">
              {envVars.map((v, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <input
                    type="text"
                    value={v.key}
                    onChange={(e) => updateEnvVar(i, 'key', e.target.value)}
                    placeholder="API_KEY_NAME"
                    className="flex-1 text-xs font-mono bg-secondary rounded-sm px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">=</span>
                  <input
                    type="text"
                    value={v.value}
                    onChange={(e) => updateEnvVar(i, 'value', e.target.value)}
                    placeholder="value"
                    className="flex-1 text-xs font-mono bg-secondary rounded-sm px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => removeEnvVar(i)}
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  >
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setEnvVars((p) => [...p, { key: '', value: '' }])}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
            >
              <PlusIcon className="w-3 h-3" />
              Add variable
            </button>
            {envVars.some((v) => v.key.trim() && v.value.trim()) && (
              <button
                type="button"
                onClick={handleSaveEnvVars}
                disabled={envSaving}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 disabled:opacity-50 self-start"
              >
                {envSaving ? 'Saving...' : 'Save Variables'}
              </button>
            )}
            {envSaved && (
              <p className="text-xs text-muted-foreground">
                Saved — redeploy your project to apply the new variables
              </p>
            )}
            {envError && <p className="text-xs text-destructive">{envError}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
