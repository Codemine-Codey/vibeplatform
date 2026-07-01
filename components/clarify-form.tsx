'use client'

import { useState } from 'react'
import type { ClarifyQuestion } from '@/ai/clarify-questions'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// W4 — personalization questions shown before a NEW project is built. Each question offers 3
// choices plus a "write your own" box. Submit → answers feed the build; Skip → the AI decides.
export function ClarifyForm({
  questions,
  onSubmit,
  onSkip,
}: {
  questions: ClarifyQuestion[]
  onSubmit: (answers: string) => void
  onSkip: () => void
}) {
  const [selected, setSelected] = useState<Record<number, string>>({})
  const [custom, setCustom] = useState<Record<number, string>>({})

  function handleSubmit() {
    const parts = questions
      .map((q, i) => {
        const ans = (custom[i]?.trim() || selected[i] || '').trim()
        return ans ? `- ${q.question} ${ans}` : null
      })
      .filter(Boolean)
    // If nothing was answered, treat Submit like Skip.
    if (parts.length === 0) onSkip()
    else onSubmit(parts.join('\n'))
  }

  return (
    <div className="rounded-lg border border-primary/20 bg-card p-4 space-y-4 shadow-sm">
      <p className="text-sm font-medium">A couple quick questions to make it yours — or skip and I'll choose.</p>
      {questions.map((q, i) => (
        <div key={i} className="space-y-2">
          <p className="text-sm font-medium text-foreground/90">{q.question}</p>
          <div className="flex flex-wrap gap-2">
            {q.options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  setSelected((s) => ({ ...s, [i]: opt }))
                  setCustom((c) => ({ ...c, [i]: '' }))
                }}
                className={cn(
                  'px-3 py-1.5 rounded-full border text-sm transition-colors',
                  selected[i] === opt
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-muted'
                )}
              >
                {opt}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Or write your own…"
            value={custom[i] ?? ''}
            onChange={(e) => {
              const v = e.target.value
              setCustom((c) => ({ ...c, [i]: v }))
              if (v) setSelected((s) => ({ ...s, [i]: '' }))
            }}
            className="w-full text-sm rounded-md border border-border px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
      ))}
      <div className="flex gap-2 justify-end pt-1">
        <Button variant="ghost" size="sm" onClick={onSkip}>Skip</Button>
        <Button size="sm" onClick={handleSubmit}>Submit</Button>
      </div>
    </div>
  )
}
