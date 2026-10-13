const steps = [
  'Dataset',
  'Preprocessing',
  'Model training',
  'Evaluation',
  'Reliability',
  'Explainability',
  'Prediction',
]

export function WorkflowStrip() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <span className="rounded-full border border-f1-red/40 bg-f1-red/10 px-2.5 py-1 font-display text-f1-text">{s}</span>
          {i < steps.length - 1 ? <span className="text-f1-muted">→</span> : null}
        </div>
      ))}
    </div>
  )
}
