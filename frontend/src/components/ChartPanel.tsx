import type { ReactNode } from 'react'

type Props = {
  title: string
  subtitle?: string
  children: ReactNode
  className?: string
}

export function ChartPanel({ title, subtitle, children, className = '' }: Props) {
  return (
    <section className={`panel panel-glow p-4 md:p-5 ${className}`}>
      <header className="mb-4 border-b border-f1-border/50 pb-3">
        <h3 className="font-display text-sm font-semibold tracking-wide text-f1-text">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs text-f1-muted">{subtitle}</p> : null}
      </header>
      <div className="min-h-[240px]">{children}</div>
    </section>
  )
}
