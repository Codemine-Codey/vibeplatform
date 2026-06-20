'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getBrowserSupabase } from '@/lib/supabase/client'
import { ZapIcon, Loader2Icon } from 'lucide-react'

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const isLogin = mode === 'login'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setLoading(true)
    const supabase = getBrowserSupabase()
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/')
        router.refresh()
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        // If email confirmation is OFF, a session is returned immediately.
        if (data.session) {
          router.push('/')
          router.refresh()
        } else {
          setNotice('Account created. Check your email to confirm, then sign in.')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <ZapIcon className="w-5 h-5" />
          <span className="text-lg font-semibold tracking-tight">Codemine</span>
        </div>
        <div className="rounded-xl border border-primary/15 bg-background p-6 shadow-sm">
          <h1 className="text-xl font-semibold mb-1">{isLogin ? 'Welcome back' : 'Create your account'}</h1>
          <p className="text-sm text-muted-foreground mb-5">
            {isLogin ? 'Sign in to your projects.' : 'Start building in seconds.'}
          </p>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full text-sm bg-secondary rounded-md px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground"
            />
            <input
              type="password"
              required
              minLength={6}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min 6 characters)"
              className="w-full text-sm bg-secondary rounded-md px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading && <Loader2Icon className="w-4 h-4 animate-spin" />}
              {isLogin ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
        <p className="text-center text-sm text-muted-foreground mt-5">
          {isLogin ? (
            <>
              No account?{' '}
              <Link href="/signup" className="text-foreground underline underline-offset-2">
                Sign up
              </Link>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <Link href="/login" className="text-foreground underline underline-offset-2">
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
