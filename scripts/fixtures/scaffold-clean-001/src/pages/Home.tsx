import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function Home() {
  const [on, setOn] = useState(false)
  return (
    <div className={cn('min-h-screen bg-background p-8')}>
      <Button onClick={() => setOn(v => !v)}>{on ? 'On' : 'Off'}</Button>
    </div>
  )
}
