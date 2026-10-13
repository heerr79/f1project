type Props = { title: string; message: string }

export function EmptyState({ title, message }: Props) {
  return (
    <div className="panel panel-glow flex min-h-[180px] flex-col items-center justify-center p-8 text-center">
      <div className="mb-3 h-1 w-12 rounded-full bg-f1-red/80" />
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-f1-muted">{message}</p>
    </div>
  )
}
