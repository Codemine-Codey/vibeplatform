import { scanUndefinedVars } from '../ai/tools/generate-files/undefined-var-scan'

const cases: { name: string; path: string; content: string; expectFlag: string[] }[] = [
  {
    name: 'navLinks undeclared (the real crash)',
    path: 'src/components/Layout.tsx',
    content: `
import { Link } from 'react-router-dom'
export default function Layout() {
  return (
    <nav>
      {navLinks.map((l) => <Link key={l.href} to={l.href}>{l.label}</Link>)}
    </nav>
  )
}`,
    expectFlag: ['navLinks'],
  },
  {
    name: 'clean component with declared navLinks',
    path: 'src/components/Layout.tsx',
    content: `
import { Link } from 'react-router-dom'
const navLinks = [{ href: '/', label: 'Home' }, { href: '/about', label: 'About' }]
export default function Layout() {
  return (
    <nav>
      {navLinks.map((l) => <Link key={l.href} to={l.href}>{l.label}</Link>)}
    </nav>
  )
}`,
    expectFlag: [],
  },
  {
    name: 'hooks, destructured props, globals',
    path: 'src/pages/Home.tsx',
    content: `
import React, { useState, useEffect, useRef, useMemo } from 'react'
interface Props { title: string; items: string[] }
export default function Home({ title, items }: Props) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const doubled = useMemo(() => count * 2, [count])
  useEffect(() => {
    const id = window.setTimeout(() => setCount((c) => c + 1), 1000)
    return () => window.clearTimeout(id)
  }, [])
  const total = items.reduce((a, b) => a + b.length, 0)
  return <div ref={ref}>{title} {count} {doubled} {total} {Math.max(1, 2)}</div>
}`,
    expectFlag: [],
  },
  {
    name: 'canvas game with rAF, refs, playTone',
    path: 'src/pages/Home.tsx',
    content: `
import { useRef, useEffect, useState } from 'react'
export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const state = useRef({ x: 0, score: 0 })
  const [hud, setHud] = useState(0)
  useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d')!
    let raf = 0
    const loop = () => {
      state.current.x += 1
      ctx.clearRect(0, 0, 300, 300)
      ctx.fillStyle = '#fff'
      ctx.fillRect(state.current.x, 10, 20, 20)
      setHud(state.current.score)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={canvasRef} width={300} height={300} />
}`,
    expectFlag: [],
  },
  {
    name: 'undeclared helper function call',
    path: 'src/pages/Home.tsx',
    content: `
import { useState } from 'react'
export default function Home() {
  const [v, setV] = useState(0)
  const onClick = () => setV(computeNext(v))
  return <button onClick={onClick}>{v}</button>
}`,
    expectFlag: ['computeNext'],
  },
  {
    name: 'type-only references must not flag',
    path: 'src/lib/types.ts',
    content: `
import type { ReactNode } from 'react'
export interface Item { id: string; label: string; children?: ReactNode }
export type ItemMap = Record<string, Item>
export function make(id: string): Item { return { id, label: id } }`,
    expectFlag: [],
  },
]

let failures = 0
for (const c of cases) {
  const found = scanUndefinedVars([{ path: c.path, content: c.content }]).map((v) =>
    v.issue.match(/`([^`]+)`/)?.[1] ?? ''
  )
  const expected = c.expectFlag.sort()
  const got = [...new Set(found)].sort()
  const ok = JSON.stringify(expected) === JSON.stringify(got)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`)
  if (!ok) console.log(`      expected [${expected}] got [${got}]`)
}
console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILED'}`)
process.exit(failures === 0 ? 0 : 1)
