type Props = {
  label: string
  value: string | number
  hint?: string
  accent?: boolean
}

export function MetricCard({ label, value, hint, accent }: Props) {
  return (
    <div
      className={`panel panel-glow relative overflow-hidden p-4 transition duration-300 hover:border-f1-red/30 ${
        accent ? 'border-f1-red/35' : ''
      }`}
    >
      {accent ? (
        <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-f1-red/15 blur-2xl" />
      ) : null}
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-f1-muted">{label}</p>
      <p className={`font-display mt-2 text-2xl font-semibold tabular-nums tracking-tight ${accent ? 'text-f1-red' : 'text-f1-text'}`}>
        {value}
      </p>
      {hint ? <p className="mt-2 text-xs leading-relaxed text-f1-muted">{hint}</p> : null}
    </div>
  )
}
