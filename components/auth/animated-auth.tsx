'use client'

import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getBrowserSupabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Eye, EyeOff, Loader2, Zap } from 'lucide-react'

// Where the characters' pupils should aim.
//  - 'cursor'    → follow the mouse (default, idle state)
//  - 'eachOther' → glance toward the middle of the stage (email field focused)
//  - 'password'  → peek down-right at the form (password just revealed)
type LookMode = 'cursor' | 'eachOther' | 'password'

interface Mouse {
  x: number
  y: number
}

// ---------------------------------------------------------------------------
// EyeBall + Pupil — the mouse-tracking primitive. The white eye reads its own
// on-screen position each render; the black pupil offsets a clamped vector
// toward the current target point, and scaleY snaps to ~0 for a blink.
// ---------------------------------------------------------------------------
function EyeBall({
  mouse,
  mode,
  size = 22,
}: {
  mouse: Mouse
  mode: LookMode
  size?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [blink, setBlink] = useState(false)

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    let closeTimeout: ReturnType<typeof setTimeout>
    const schedule = () => {
      // Blink on a random, human-feeling interval.
      timeout = setTimeout(() => {
        setBlink(true)
        closeTimeout = setTimeout(() => setBlink(false), 130)
        schedule()
      }, 1800 + Math.random() * 3600)
    }
    schedule()
    return () => {
      clearTimeout(timeout)
      clearTimeout(closeTimeout)
    }
  }, [])

  let dx = 0
  let dy = 0
  const el = ref.current
  if (el && typeof window !== 'undefined') {
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2

    let tx = mouse.x
    let ty = mouse.y
    if (mode === 'eachOther') {
      // Look toward the horizontal centre of the viewport's left half → the
      // characters end up staring at one another.
      tx = window.innerWidth * 0.25
      ty = cy
    } else if (mode === 'password') {
      // Password is revealed → the crew politely averts its gaze and glances the
      // OTHER way (mirrored across the viewport centre from the form), rather than
      // peeking at what you just made visible.
      tx = window.innerWidth * 0.28
      ty = window.innerHeight * 0.42
    }

    const vx = tx - cx
    const vy = ty - cy
    const dist = Math.hypot(vx, vy) || 1
    const max = size * 0.26
    const m = Math.min(max, dist)
    dx = (vx / dist) * m
    dy = (vy / dist) * m
  }

  const pupil = Math.max(6, Math.round(size * 0.42))

  return (
    <div
      ref={ref}
      className="relative rounded-full bg-white shadow-inner ring-1 ring-black/10"
      style={{ width: size, height: size }}
    >
      <div
        className="absolute rounded-full bg-neutral-900"
        style={{
          width: pupil,
          height: pupil,
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scaleY(${blink ? 0.12 : 1})`,
          transition: 'transform 90ms linear',
        }}
      >
        <span
          className="absolute rounded-full bg-white/80"
          style={{ width: pupil * 0.3, height: pupil * 0.3, left: '18%', top: '18%' }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Character — a coloured shape that leans toward the cursor and carries a
// pair of googly eyes.
// ---------------------------------------------------------------------------
function Character({
  mouse,
  mode,
  lean,
  className,
  eyeSize = 22,
  eyeGap = 10,
  eyesTop = '28%',
  children,
}: {
  mouse: Mouse
  mode: LookMode
  lean: number
  className?: string
  eyeSize?: number
  eyeGap?: number
  eyesTop?: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn('relative origin-bottom', className)}
      style={{
        transform: `rotate(${lean}deg) skewX(${lean * -0.4}deg)`,
        transition: 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <div
        className="absolute left-1/2 flex -translate-x-1/2"
        style={{ top: eyesTop, gap: eyeGap }}
      >
        <EyeBall mouse={mouse} mode={mode} size={eyeSize} />
        <EyeBall mouse={mouse} mode={mode} size={eyeSize} />
      </div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CharacterStage — the left panel cast: purple tall, black tall, orange
// semicircle, yellow rounded block.
// ---------------------------------------------------------------------------
function CharacterStage({ mouse, mode }: { mouse: Mouse; mode: LookMode }) {
  // Global lean derived from cursor position relative to viewport centre.
  const [lean, setLean] = useState(0)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const rel = (mouse.x - window.innerWidth / 2) / (window.innerWidth / 2)
    setLean(Math.max(-7, Math.min(7, rel * 7)))
  }, [mouse.x])

  return (
    <div className="flex items-end justify-center gap-5">
      {/* Purple tall */}
      <Character
        mouse={mouse}
        mode={mode}
        lean={lean * 0.9}
        eyeSize={22}
        eyeGap={10}
        eyesTop="22%"
        className="h-56 w-24 rounded-t-[2.5rem] rounded-b-xl bg-violet-500 shadow-lg shadow-violet-900/20"
      />
      {/* Orange semicircle (short, sits low) */}
      <Character
        mouse={mouse}
        mode={mode}
        lean={lean * 1.3}
        eyeSize={20}
        eyeGap={9}
        eyesTop="46%"
        className="h-24 w-28 rounded-t-full bg-orange-400 shadow-lg shadow-orange-900/20"
      />
      {/* Black tall */}
      <Character
        mouse={mouse}
        mode={mode}
        lean={lean}
        eyeSize={24}
        eyeGap={11}
        eyesTop="20%"
        className="h-64 w-24 rounded-t-3xl rounded-b-xl bg-neutral-900 shadow-lg shadow-black/30"
      />
      {/* Yellow rounded block */}
      <Character
        mouse={mouse}
        mode={mode}
        lean={lean * 1.1}
        eyeSize={21}
        eyeGap={10}
        eyesTop="30%"
        className="h-40 w-24 rounded-[1.75rem] bg-amber-300 shadow-lg shadow-amber-900/20"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// AnimatedAuth — split screen: animated cast on the left, real Supabase form
// on the right. Login + signup share this component.
// ---------------------------------------------------------------------------
export function AnimatedAuth({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter()
  const isLogin = mode === 'login'

  const [mouse, setMouse] = useState<Mouse>({ x: 0, y: 0 })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // rAF-batched mouse tracking so the eyes update at most once per frame.
  useEffect(() => {
    let raf = 0
    let latest: Mouse = { x: 0, y: 0 }
    const onMove = (e: MouseEvent) => {
      latest = { x: e.clientX, y: e.clientY }
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        setMouse(latest)
      })
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  const lookMode: LookMode = showPassword
    ? 'password'
    : emailFocused
      ? 'eachOther'
      : 'cursor'

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
        // Email confirmation OFF → a session comes back immediately.
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

  async function handleGoogle() {
    setError(null)
    setGoogleLoading(true)
    const supabase = getBrowserSupabase()
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) throw error
      // On success the browser is redirected to Google, so nothing else runs.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start Google sign-in.')
      setGoogleLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* LEFT — animated cast */}
      <div className="relative hidden w-1/2 overflow-hidden lg:flex">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-100 via-amber-50 to-orange-100" />
        <div
          className="absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 30%, rgba(139,92,246,0.18), transparent 42%), radial-gradient(circle at 80% 70%, rgba(251,146,60,0.2), transparent 45%)',
          }}
        />
        <div className="relative z-10 flex w-full flex-col justify-between p-10">
          <Link href="/home" className="flex w-fit items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-neutral-900 text-white">
              <Zap className="size-4" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-neutral-900">Codemine</span>
          </Link>

          <div className="flex flex-1 items-center justify-center py-10">
            <CharacterStage mouse={mouse} mode={lookMode} />
          </div>

          <div className="max-w-sm">
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">
              Build web apps by just describing them.
            </h2>
            <p className="mt-2 text-sm text-neutral-600">
              Prompt it, watch it build, ship it live. The whole crew is watching your cursor.
            </p>
          </div>
        </div>
      </div>

      {/* RIGHT — real form */}
      <div className="flex w-full items-center justify-center px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="flex size-8 items-center justify-center rounded-lg bg-neutral-900 text-white">
              <Zap className="size-4" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Codemine</span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">
            {isLogin ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {isLogin
              ? 'Sign in to pick up where you left off.'
              : 'Start turning prompts into real apps in seconds.'}
          </p>

          <Button
            type="button"
            variant="outline"
            onClick={handleGoogle}
            disabled={googleLoading || loading}
            className="mt-6 h-11 w-full gap-2.5"
          >
            {googleLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <GoogleGlyph className="size-4" />
            )}
            Log in with Google
          </Button>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase tracking-wide text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                className="h-11"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {isLogin && (
                  <Link
                    href="/login"
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Forgot password?
                  </Link>
                )}
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  placeholder={isLogin ? 'Your password' : 'At least 6 characters'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {isLogin && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={remember}
                  onCheckedChange={(v) => setRemember(v === true)}
                />
                Remember me for 30 days
              </label>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
            {notice && <p className="text-sm text-muted-foreground">{notice}</p>}

            <Button type="submit" disabled={loading} className="h-11 w-full">
              {loading && <Loader2 className="size-4 animate-spin" />}
              {isLogin ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {isLogin ? (
              <>
                Don&apos;t have an account?{' '}
                <Link href="/signup" className="font-medium text-foreground underline-offset-2 hover:underline">
                  Sign up
                </Link>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <Link href="/login" className="font-medium text-foreground underline-offset-2 hover:underline">
                  Sign in
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

// Simple multi-colour Google "G" built from divs — no SVG, per house rules.
function GoogleGlyph({ className }: { className?: string }) {
  return (
    <span
      className={cn('relative inline-block overflow-hidden rounded-full', className)}
      style={{
        background:
          'conic-gradient(from -45deg, #ea4335 0deg 90deg, #fbbc05 90deg 180deg, #34a853 180deg 270deg, #4285f4 270deg 360deg)',
      }}
      aria-hidden
    >
      <span className="absolute inset-[22%] rounded-full bg-white" />
      <span className="absolute right-0 top-[42%] h-[16%] w-1/2 bg-[#4285f4]" />
    </span>
  )
}
