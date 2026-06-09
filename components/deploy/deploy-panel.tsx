'use client'

import { useState } from 'react'
import {
  RocketIcon,
  GlobeIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  AlertCircleIcon,
  PlusIcon,
  XIcon,
  CheckIcon,
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

const BUILD_STEPS = ['Compiling code', 'Bundling assets', 'Optimizing output']

function BuildingAnimation() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 p-6 text-center">
      {/* Equalizer bars */}
      <div className="flex items-end gap-1 h-10">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="w-1.5 rounded-full bg-foreground/70"
            style={{
              animation: `equalizer 1.2s ease-in-out infinite`,
              animationDelay: `${i * 0.12}s`,
              height: '40%',
            }}
          />
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Building your project</p>
        <p className="text-xs text-muted-foreground">Up to 90 seconds</p>
      </div>
      {/* Step list */}
      <div className="flex flex-col gap-1.5 text-left">
        {BUILD_STEPS.map((step, i) => (
          <div key={step} className="flex items-center gap-2 text-xs text-muted-foreground">
            <div
              className="w-1 h-1 rounded-full bg-foreground/40"
              style={{ animation: `pulse 1.6s ease-in-out infinite`, animationDelay: `${i * 0.4}s` }}
            />
            {step}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes equalizer {
          0%, 100% { height: 20%; }
          50% { height: 90%; }
        }
      `}</style>
    </div>
  )
}

function PublishingAnimation() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-5 p-6 text-center">
      {/* Orbiting ring */}
      <div className="relative flex items-center justify-center w-14 h-14">
        <RocketIcon className="w-5 h-5 text-foreground" />
        <div
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-foreground/50"
          style={{ animation: 'spin 1s linear infinite' }}
        />
        <div
          className="absolute inset-1 rounded-full border border-transparent border-t-foreground/25"
          style={{ animation: 'spin 1.5s linear infinite reverse' }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Publishing live</p>
        <p className="text-xs text-muted-foreground">Almost there...</p>
      </div>
    </div>
  )
}

export function DeployPanel({ className }: Props) {
  const sandboxId = useSandboxStore((s) => s.sandboxId)
  const deployStatus = useSandboxStore((s) => s.deployStatus)
  const deployedUrl = useSandboxStore((s) => s.deployedUrl)
  const deployError = useSandboxStore((s) => s.deployError)
  const deployProjectName = useSandboxStore((s) => s.deployProjectName)
  const setDeployState = useSandboxStore((s) => s.setDeployState)
  const setPendingChatMessage = useSandboxStore((s) => s.setPendingChatMessage)
  const chatStatus = useSandboxStore((s) => s.chatStatus)
  const paths = useSandboxStore((s) => s.paths)

  const hasFiles = paths.length > 0
  const aiWorking = chatStatus === 'streaming' || chatStatus === 'submitted'

  const [domain, setDomain] = useState('')
  const [domainAdding, setDomainAdding] = useState(false)
  const [domainAdded, setDomainAdded] = useState(false)
  const [domainError, setDomainError] = useState<string | undefined>()

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
      const data = await res.json() as { url?: string; projectName?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'Deployment failed')
      setDeployState({ deployStatus: 'deploying' })
      // Brief pause so user sees "Publishing" state before done
      await new Promise((r) => setTimeout(r, 800))
      setDeployState({ deployStatus: 'done', deployedUrl: data.url, deployProjectName: data.projectName })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      setDeployState({ deployStatus: 'error', deployError: errMsg })
      // Send error to AI so it can diagnose and fix
      setPendingChatMessage(
        `Deployment failed with this error:\n\n${errMsg}\n\nCan you fix the issue so I can publish the project?`
      )
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
            <div className="flex items-start gap-2 text-destructive text-xs max-w-xs text-left bg-destructive/8 rounded-md px-3 py-2">
              <AlertCircleIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{deployError}</span>
            </div>
          )}
          {!sandboxId && (
            <p className="text-muted-foreground text-sm">Generate a project first to enable publishing.</p>
          )}
          {sandboxId && (
            <>
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center mb-1">
                  <RocketIcon className="w-5 h-5 text-foreground" />
                </div>
                <p className="text-sm font-medium">Deploy to the web</p>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-[200px]">
                  {aiWorking
                    ? 'Wait for the AI to finish first'
                    : !hasFiles
                    ? 'Generate a project first'
                    : 'Your project will go live on Codemine edge servers worldwide with a shareable link'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleDeploy}
                disabled={aiWorking || !hasFiles}
                className="flex items-center gap-2 px-5 py-2.5 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deployStatus === 'error' ? (
                  <>
                    <RefreshCwIcon className="w-4 h-4" />
                    Try Again
                  </>
                ) : (
                  <>
                    <RocketIcon className="w-4 h-4" />
                    Publish Live
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}

      {/* Building */}
      {deployStatus === 'building' && <BuildingAnimation />}

      {/* Publishing */}
      {deployStatus === 'deploying' && <PublishingAnimation />}

      {/* Done */}
      {deployStatus === 'done' && deployedUrl && (
        <div className="flex flex-col gap-5 p-5">
          {/* Success */}
          <div className="flex flex-col items-center gap-2.5 text-center">
            <div className="w-9 h-9 rounded-full bg-foreground/8 flex items-center justify-center">
              <CheckIcon className="w-4.5 h-4.5 text-foreground" />
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium">Live!</p>
              <a
                href={deployedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-muted-foreground underline underline-offset-2 hover:text-foreground break-all transition-colors"
              >
                {deployedUrl}
              </a>
            </div>
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
                <code className="font-mono">{deployedUrl.replace('https://', '')}</code> at your registrar
              </p>
            )}
            {domainError && <p className="text-xs text-destructive">{domainError}</p>}
          </div>

          <div className="border-t border-primary/10" />

          {/* Environment Variables */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium">Environment Variables</p>
            <p className="text-xs text-muted-foreground -mt-1">
              Accessible via <code className="font-mono">import.meta.env.VITE_*</code>
            </p>
            <div className="flex flex-col gap-1.5">
              {envVars.map((v, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <input
                    type="text"
                    value={v.key}
                    onChange={(e) => updateEnvVar(i, 'key', e.target.value)}
                    placeholder="KEY_NAME"
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
                Saved — redeploy to apply the new variables
              </p>
            )}
            {envError && <p className="text-xs text-destructive">{envError}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
