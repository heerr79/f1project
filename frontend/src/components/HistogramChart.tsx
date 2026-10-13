import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export function binsToChart(bins?: Array<{ start: number; end: number; count: number }>) {
  return (bins || []).map((b) => ({ mid: (b.start + b.end) / 2, count: b.count }))
}

export function HistogramChart({
  data,
  color = '#e10600',
  xLabel,
}: {
  data: Array<{ mid: number; count: number }>
  color?: string
  xLabel?: string
}) {
  if (!data.length) return <p className="text-sm text-f1-muted">No data for chart.</p>
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data}>
        <CartesianGrid stroke="#2a3140" vertical={false} />
        <XAxis dataKey="mid" tick={{ fill: '#9aa3b2', fontSize: 10 }} label={xLabel ? { value: xLabel, fill: '#9aa3b2' } : undefined} />
        <YAxis tick={{ fill: '#9aa3b2', fontSize: 10 }} />
        <Tooltip contentStyle={{ background: '#12151a', border: '1px solid #2a303c' }} />
        <Bar dataKey="count" fill={color} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
