import type { ReactNode } from 'react'

type Props = {
  title: string
  subtitle?: string
  children?: ReactNode
}

export function PageHeader({ title, subtitle, children }: Props) {
  return (
    <section className="panel relative overflow-hidden p-5 md:p-6">
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-f1-red/10 blur-3xl" />
      <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-display text-[11px] uppercase tracking-[0.3em] text-f1-red">Research module</p>
          <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight md:text-3xl">{title}</h2>
          {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-relaxed text-f1-muted">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </section>
  )
}
