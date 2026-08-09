import { useState } from 'react'
// DEFECT: @/components/MainViewTimer was invented mid-file and never created — not in
// the manifest, not a scaffold path. Resolve gate must flag; end-of-gen gate creates it.
import MainViewTimer from '@/components/MainViewTimer'

export default function Home() {
  const [running, setRunning] = useState(false)
  return (
    <div className="min-h-screen bg-background p-8">
      <MainViewTimer running={running} onToggle={() => setRunning(v => !v)} />
    </div>
  )
}
