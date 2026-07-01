'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ClarifyQuestion } from '@/ai/clarify-questions'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// W4 — personalization asked ONE question at a time before a NEW project is built. Each question
// shows 2-3 choices plus a "write your own" box; picking one advances to the next. After the last
// question a Submit button appears. A Skip button is always visible (build without answers).
export function ClarifyForm({
  questions,
  onSubmit,
  onSkip,
}: {
  questions: ClarifyQuestion[]
  onSubmit: (answers: string) => void
  onSkip: () => void
}) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [custom, setCustom] = useState('')
  const done = step >= questions.length

  function choose(answer: string) {
    setAnswers((a) => ({ ...a, [step]: answer }))
    setCustom('')
    setStep((s) => s + 1) // advance; past the last question → the Submit state
  }
  function submitCustom() {
    const v = custom.trim()
    if (v) choose(v)
  }
  function handleSubmit() {
    const parts = questions
      .map((q, i) => (answers[i] ? `- ${q.question} ${answers[i]}` : null))
      .filter(Boolean)
    if (parts.length === 0) onSkip()
    else onSubmit(parts.join('\n'))
  }

  const q = questions[step]

  return (
    <div className="rounded-lg border border-primary/20 bg-card p-4 shadow-sm">
      <div className="min-h-[132px]">
        <AnimatePresence mode="wait" initial={false}>
          {!done && q ? (
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-3"
            >
              <p className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                Question {step + 1} of {questions.length}
              </p>
              <p className="text-sm font-medium text-foreground/90">{q.question}</p>
              <div className="flex flex-col gap-2">
                {q.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => choose(opt)}
                    className="rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:border-primary hover:bg-primary/5"
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Or write your own…"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      submitCustom()
                    }
                  }}
                  className="flex-1 rounded-md border border-border px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
                <button
                  type="button"
                  onClick={submitCustom}
                  disabled={!custom.trim()}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-sm transition-colors',
                    custom.trim() ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground/40 cursor-default'
                  )}
                  aria-label="Next"
                >
                  →
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="submit"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-start gap-3 pt-1"
            >
              <p className="text-sm font-medium">Great — that's everything I need.</p>
              <p className="text-xs text-muted-foreground">I'll use your answers to make it yours.</p>
              <Button size="sm" onClick={handleSubmit}>Submit &amp; build</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Skip is always available — build now, let the AI decide. */}
      <div className="mt-3 border-t border-border/60 pt-2">
        <button
          type="button"
          onClick={onSkip}
          className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip — just build it
        </button>
      </div>
    </div>
  )
}
