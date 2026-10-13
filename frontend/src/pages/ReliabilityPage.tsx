import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import { ChartPanel } from '../components/ChartPanel'
import { EmptyState } from '../components/EmptyState'
import { LoadingBlock } from '../components/LoadingBlock'
import { MetricCard } from '../components/MetricCard'

export function ReliabilityPage() {
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null)
  const [rows, setRows] = useState<Array<Record<string, number | string>>>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.reliabilitySummary(), api.reliabilityDetails()])
      .then(([s, d]) => {
        setSummary(s)
        setRows(d.rows)
      })
      .catch((e) => setError(String(e)))
  }, [])

  const scatter = useMemo(
    () => rows.slice(0, 2000).map((r) => ({ width: Number(r.interval_width), abs_error: Number(r.abs_error) })),
    [rows],
  )

  if (error) return <EmptyState title="Reliability analysis error" message={error} />
  if (!summary) return <LoadingBlock />
  if (!summary.available) return <EmptyState title="Reliability not available" message={String(summary.message || '')} />

  return (
    <div className="space-y-6">
      <section className="panel p-5">
        <h2 className="text-lg font-semibold">Reliability & Uncertainty</h2>
        <p className="mt-2 text-sm text-f1-muted">
          Split conformal prediction intervals (90%) calibrated on the last 20% of 2023 races. Coverage on 2024 is empirical and may degrade
          under season shift — this is not a guarantee under arbitrary distribution change.
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Method" value="Split conformal" />
        <MetricCard label="Confidence" value="90%" accent />
        <MetricCard label="Empirical coverage (2024)" value={`${(Number(summary.empirical_coverage_2024) * 100).toFixed(1)}%`} />
        <MetricCard label="Mean interval width" value={Number(summary.mean_interval_width).toFixed(3)} />
      </div>

      <ChartPanel title="Absolute error vs interval width" subtitle="Does higher uncertainty align with larger errors?">
        <ResponsiveContainer width="100%" height={320}>
          <ScatterChart>
            <CartesianGrid stroke="#2a303c" />
            <XAxis type="number" dataKey="width" name="Width" tick={{ fill: '#9aa3b2', fontSize: 11 }} />
            <YAxis type="number" dataKey="abs_error" name="|Error|" tick={{ fill: '#9aa3b2', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#12151a', border: '1px solid #2a303c' }} />
            <Scatter data={scatter} fill="#e10600" fillOpacity={0.25} />
          </ScatterChart>
        </ResponsiveContainer>
        <p className="mt-2 text-xs text-f1-muted">
          Correlation(|error|, width) = {Number(summary.corr_abs_error_width).toFixed(3)}. Low average error alone does not imply reliability.
        </p>
      </ChartPanel>
    </div>
  )
}
