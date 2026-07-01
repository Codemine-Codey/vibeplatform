import { AnimatedAuth } from '@/components/auth/animated-auth'

export const metadata = { title: 'Sign in — Codemine' }

export default function LoginPage() {
  return <AnimatedAuth mode="login" />
}
