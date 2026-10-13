import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import { ChartPanel } from '../components/ChartPanel'
import { EmptyState } from '../components/EmptyState'
import { LoadingBlock } from '../components/LoadingBlock'
import { MetricCard } from '../components/MetricCard'

export function ExplainabilityPage() {
  const [shap, setShap] = useState<Array<{ feature: string; mean_abs_shap: number }>>([])
  const [ablation, setAblation] = useState<Array<Record<string, unknown>>>([])
  const [stability, setStability] = useState<{ runs: Array<Record<string, number>>; summary: Record<string, number> | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.shap(), api.ablation(), api.stability()])
      .then(([s, a, st]) => {
        setShap(s.importance || [])
        setAblation(a.experiments || [])
        setStability(st)
      })
      .catch((e) => setError(String(e)))
  }, [])

  if (error) return <EmptyState title="Explainability error" message={error} />
  if (!stability) return <LoadingBlock />

  const topShap = shap.slice(0, 15)

  return (
    <div className="space-y-6">
      <section className="panel p-5">
        <h2 className="text-lg font-semibold">Explainable AI & Experiments</h2>
        <p className="mt-2 text-sm text-f1-muted">
          SHAP values describe model behaviour on the training schema. They do not establish causal relationships in the race environment.
        </p>
      </section>

      {stability.summary ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard label="Stability MAE" value={`${stability.summary.MAE_mean.toFixed(3)} ± ${stability.summary.MAE_std.toFixed(3)}`} />
          <MetricCard label="Stability RMSE" value={`${stability.summary.RMSE_mean.toFixed(3)} ± ${stability.summary.RMSE_std.toFixed(3)}`} />
          <MetricCard label="Stability R²" value={`${stability.summary.R2_mean.toFixed(3)} ± ${stability.summary.R2_std.toFixed(3)}`} hint="Training repeatability on 2024 test" />
        </div>
      ) : null}

      <ChartPanel title="SHAP global importance (mean |SHAP|)">
        {topShap.length ? (
          <ResponsiveContainer width="100%" height={360}>
            <BarChart layout="vertical" data={topShap.map((f) => ({ name: f.feature, value: f.mean_abs_shap }))}>
              <CartesianGrid stroke="#2a303c" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#9aa3b2', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={180} tick={{ fill: '#9aa3b2', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#12151a', border: '1px solid #2a303c' }} />
              <Bar dataKey="value" fill="#e10600" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-f1-muted">SHAP importance not generated yet.</p>
        )}
      </ChartPanel>

      <ChartPanel title="Ablation study (2024 test RMSE)">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={ablation.map((a) => ({ name: a.experiment, RMSE: Number(a.RMSE) }))}>
            <CartesianGrid stroke="#2a303c" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#9aa3b2', fontSize: 11 }} />
            <YAxis tick={{ fill: '#9aa3b2', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#12151a', border: '1px solid #2a303c' }} />
            <Bar dataKey="RMSE" fill="#f5f7fa" />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-4 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-f1-muted">
              <tr>
                {['experiment', 'n_train', 'n_test', 'MAE', 'RMSE', 'R2'].map((h) => (
                  <th key={h} className="p-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ablation.map((a) => (
                <tr key={String(a.experiment)} className="border-t border-f1-border/60">
                  <td className="p-2">{String(a.experiment)}</td>
                  <td className="p-2">{String(a.n_train)}</td>
                  <td className="p-2">{String(a.n_test)}</td>
                  <td className="p-2 tabular-nums">{Number(a.MAE).toFixed(3)}</td>
                  <td className="p-2 tabular-nums">{Number(a.RMSE).toFixed(3)}</td>
                  <td className="p-2 tabular-nums">{Number(a.R2).toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartPanel>
    </div>
  )
}
