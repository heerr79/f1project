export function LoadingBlock() {
  return (
    <div className="panel panel-glow flex min-h-[120px] flex-col items-center justify-center gap-3 p-6">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-f1-border border-t-f1-red" />
      <p className="text-sm text-f1-muted">Loading analysis…</p>
    </div>
  )
}
