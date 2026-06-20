'use client'

import { useEffect, useRef } from 'react'
import { useSandboxStore } from '@/app/state'

// Kill the sandbox the moment the user leaves (tab close / navigate away), so we
// stop paying for provisioned memory instead of running out the 30-min ceiling.
// Safe now that every project is snapshotted to Storage and reopenable from the
// dashboard — a killed session is never lost, just paused.
export function SandboxLifecycle() {
  const sandboxId = useSandboxStore((s) => s.sandboxId)
  const idRef = useRef<string | undefined>(undefined)
  idRef.current = sandboxId

  useEffect(() => {
    function killOnLeave() {
      const id = idRef.current
      if (!id) return
      try {
        const body = JSON.stringify({ sandboxId: id })
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
          navigator.sendBeacon('/api/sandbox/stop', new Blob([body], { type: 'text/plain' }))
        }
      } catch {
        /* best-effort */
      }
    }
    // pagehide is the reliable "leaving" signal (covers tab close + navigation).
    window.addEventListener('pagehide', killOnLeave)
    return () => window.removeEventListener('pagehide', killOnLeave)
  }, [])

  return null
}
