import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import { ChartPanel } from '../components/ChartPanel'
import { EmptyState } from '../components/EmptyState'
import { LoadingBlock } from '../components/LoadingBlock'
import { MetricCard } from '../components/MetricCard'
import { PageHeader } from '../components/PageHeader'
import { WorkflowStrip } from '../components/WorkflowStrip'

export function OverviewPage() {
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null)
  const [models, setModels] = useState<Record<string, unknown> | null>(null)
  const [lapHist, setLapHist] = useState<Array<{ mid: number; count: number }>>([])
  const [ageHist, setAgeHist] = useState<Array<{ mid: number; count: number }>>([])
  const [reliability, setReliability] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.datasetSummary(), api.modelComparison(), api.chart('lap_time_sec'), api.chart('tyre_age'), api.reliabilitySummary()])
      .then(([s, m, lap, age, rel]) => {
        setSummary(s)
        setModels(m)
        setReliability(rel)
        const toChart = (bins?: Array<{ start: number; end: number; count: number }>) =>
          (bins || []).map((b) => ({ mid: (b.start + b.end) / 2, count: b.count }))
        setLapHist(toChart(lap.bins))
        setAgeHist(toChart(age.bins))
      })
      .catch((e) => setError(String(e)))
  }, [])

  const best = useMemo(() => {
    if (!models?.evaluated) return null
    const list = (models.models as Array<Record<string, number | string>>) || []
    return list.reduce((a, b) => (Number(a.RMSE) < Number(b.RMSE) ? a : b), list[0])
  }, [models])

  if (error) return <EmptyState title="Unable to load overview" message={error} />
  if (!summary) return <LoadingBlock />

  if (!summary.loaded) {
    return (
      <EmptyState
        title="Dataset not loaded"
        message="Place F1_Tyre_Degradation_Dataset_2023_2024.csv in the data/ folder and start the FastAPI backend."
      />
    )
  }

  const compounds = Object.entries((summary.compounds as Record<string, number>) || {}).map(([name, value]) => ({ name, value }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Research Overview"
        subtitle="Machine learning evaluation on real 2023–2024 lap records with temporal generalization to the unseen 2024 season."
      />
      <section className="panel p-4">
        <WorkflowStrip />
        <div className="mt-4 grid gap-3 text-xs text-f1-muted sm:grid-cols-3">
          <p>Train samples (2023): {(models?.statistics as { train_n?: number } | undefined)?.train_n ?? 'Run pipeline'}</p>
          <p>Test samples (2024): {(models?.statistics as { test_n?: number } | undefined)?.test_n ?? 'Run pipeline'}</p>
          <p>Evaluation: {models?.evaluated ? 'Complete' : 'Not evaluated'}</p>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Lap records" value={String((summary.shape as { rows?: number } | undefined)?.rows ?? '—')} />
        <MetricCard label="Races" value={String(summary.races ?? '—')} />
        <MetricCard label="Drivers" value={String(summary.drivers ?? '—')} />
        <MetricCard label="Teams" value={String(summary.teams ?? '—')} accent />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Selected model" value={best ? String(best.model) : 'Not evaluated'} accent />
        <MetricCard label="MAE (2024)" value={best ? Number(best.MAE).toFixed(3) : '—'} />
        <MetricCard label="RMSE (2024)" value={best ? Number(best.RMSE).toFixed(3) : '—'} />
        <MetricCard label="R² (2024)" value={best ? Number(best.R2).toFixed(3) : '—'} />
      </div>

      {reliability?.available ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard label="Empirical coverage (2024)" value={`${(Number(reliability.empirical_coverage_2024) * 100).toFixed(1)}%`} />
          <MetricCard label="Mean interval width" value={Number(reliability.mean_interval_width).toFixed(3)} />
          <MetricCard label="Method" value="Split conformal (90%)" hint={String(reliability.assumptions || '')} />
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartPanel title="Lap time distribution" subtitle="Seconds">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={lapHist}>
              <CartesianGrid stroke="#2a303c" vertical={false} />
              <XAxis dataKey="mid" tick={{ fill: '#9aa3b2', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9aa3b2', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#12151a', border: '1px solid #2a303c' }} />
              <Bar dataKey="count" fill="#e10600" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Tyre compound distribution">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={compounds}>
              <CartesianGrid stroke="#2a303c" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#9aa3b2', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9aa3b2', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#12151a', border: '1px solid #2a303c' }} />
              <Bar dataKey="value" fill="#f5f7fa" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Tyre age distribution" subtitle="Laps on set">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={ageHist}>
              <CartesianGrid stroke="#2a303c" vertical={false} />
              <XAxis dataKey="mid" tick={{ fill: '#9aa3b2', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9aa3b2', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#12151a', border: '1px solid #2a303c' }} />
              <Bar dataKey="count" fill="#9aa3b2" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      <section className="panel p-5">
        <h3 className="text-sm font-semibold">Methodology timeline</h3>
        <ol className="mt-3 grid gap-2 text-sm text-f1-muted md:grid-cols-2">
          {[
            'Real F1 CSV inspection',
            'Cleaning & target validation',
            'Leakage-aware feature engineering',
            '2023 training / 2024 testing',
            'Model comparison & ablation',
            'Split-conformal uncertainty',
            'SHAP explainability',
            'Interactive prediction API',
          ].map((step, i) => (
            <li key={step} className="panel-inner px-3 py-2">
              <span className="mr-2 text-f1-red">{i + 1}.</span>
              {step}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
