import type { ReactNode } from 'react'
import { actions } from '../game/store'

export function Screen({ title, children, back = true }: { title: string; children: ReactNode; back?: boolean }) {
  return (
    <main className="screen">
      <header className="screen__head">
        {back && (
          <button className="btn btn--ghost" onClick={() => actions.goto('menu')}>
            ← Menu
          </button>
        )}
        <h1 className="screen__title">{title}</h1>
      </header>
      {children}
    </main>
  )
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function ordinal(n: number): string {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`
}

export function Delta({ value }: { value: number }) {
  if (value === 0) return <span className="delta">±0</span>
  return <span className={value > 0 ? 'delta delta--up' : 'delta delta--down'}>{value > 0 ? `+${value}` : value}</span>
}
