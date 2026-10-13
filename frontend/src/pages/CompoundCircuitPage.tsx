import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import { ChartPanel } from '../components/ChartPanel'
import { EmptyState } from '../components/EmptyState'
import { LoadingBlock } from '../components/LoadingBlock'
import { PageHeader } from '../components/PageHeader'

export function CompoundCircuitPage() {
  const [compounds, setCompounds] = useState<Array<Record<string, unknown>>>([])
  const [circuits, setCircuits] = useState<Array<Record<string, unknown>>>([])
  const [subgroups, setSubgroups] = useState<Array<Record<string, unknown>>>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.compounds(), api.circuits(), api.subgroups()])
      .then(([c, r, s]) => {
        setCompounds(c.compounds || [])
        setCircuits(r.circuits || [])
        setSubgroups((s.groups as Array<Record<string, unknown>>) || [])
      })
      .catch((e) => setError(String(e)))
  }, [])

  if (error) return <EmptyState title="Segment analysis error" message={error} />
  if (!compounds.length && !circuits.length) return <LoadingBlock />

  const highError = subgroups.filter((g) => Number(g.MAE) > 2).slice(0, 12)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compound & Circuit Analysis"
        subtitle="2024 hold-out segment metrics with sample counts. Higher MAE groups are highlighted — association, not causation."
      />

      <ChartPanel title="Tyre compound performance">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={compounds.map((c) => ({ name: c.compound, RMSE: Number(c.RMSE), n: Number(c.n) }))}>
            <CartesianGrid stroke="#2a303c" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#9aa3b2', fontSize: 11 }} />
            <YAxis tick={{ fill: '#9aa3b2', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#12151a', border: '1px solid #2a303c' }} />
            <Bar dataKey="RMSE" fill="#e10600" />
          </BarChart>
        </ResponsiveContainer>
        <SegmentTable rows={compounds} labelKey="compound" />
      </ChartPanel>

      <ChartPanel title="Circuit performance">
        <ResponsiveContainer width="100%" height={360}>
          <BarChart layout="vertical" data={circuits.map((c) => ({ name: c.circuit, RMSE: Number(c.RMSE) }))}>
            <CartesianGrid stroke="#2a303c" horizontal={false} />
            <XAxis type="number" tick={{ fill: '#9aa3b2', fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#9aa3b2', fontSize: 10 }} />
            <Tooltip contentStyle={{ background: '#12151a', border: '1px solid #2a303c' }} />
            <Bar dataKey="RMSE" fill="#f5f7fa" />
          </BarChart>
        </ResponsiveContainer>
        <SegmentTable rows={circuits} labelKey="circuit" />
      </ChartPanel>

      <ChartPanel title="Subgroup errors (tyre age, stint stage, weather)">
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-f1-muted"><tr><th className="p-2">Dimension</th><th className="p-2">Group</th><th className="p-2">n</th><th className="p-2">MAE</th><th className="p-2">RMSE</th></tr></thead>
            <tbody>
              {subgroups.map((g) => (
                <tr key={`${g.dimension}-${g.group}`} className={`border-t border-f1-border/60 ${highError.some((h) => h.group === g.group && h.dimension === g.dimension) ? 'bg-f1-red/10' : ''}`}>
                  <td className="p-2">{String(g.dimension)}</td>
                  <td className="p-2">{String(g.group)}</td>
                  <td className="p-2">{String(g.n)}</td>
                  <td className="p-2 tabular-nums">{Number(g.MAE).toFixed(3)}</td>
                  <td className="p-2 tabular-nums">{Number(g.RMSE).toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartPanel>
    </div>
  )
}

function SegmentTable({ rows, labelKey }: { rows: Array<Record<string, unknown>>; labelKey: string }) {
  return (
    <div className="mt-4 overflow-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-f1-muted"><tr><th className="p-2">{labelKey}</th><th className="p-2">n</th><th className="p-2">MAE</th><th className="p-2">RMSE</th><th className="p-2">R²</th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={String(c[labelKey])} className="border-t border-f1-border/60">
              <td className="p-2">{String(c[labelKey])}</td>
              <td className="p-2">{String(c.n)}</td>
              <td className="p-2 tabular-nums">{Number(c.MAE).toFixed(3)}</td>
              <td className="p-2 tabular-nums">{Number(c.RMSE).toFixed(3)}</td>
              <td className="p-2 tabular-nums">{Number(c.R2).toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
