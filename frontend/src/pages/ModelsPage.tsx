import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import { ChartPanel } from '../components/ChartPanel'
import { EmptyState } from '../components/EmptyState'
import { LoadingBlock } from '../components/LoadingBlock'
import { PageHeader } from '../components/PageHeader'

export function ModelsPage() {
  const [comparison, setComparison] = useState<Record<string, unknown> | null>(null)
  const [preds, setPreds] = useState<Array<Record<string, number>>>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.modelComparison(), api.predictions(2500)])
      .then(([c, p]) => {
        setComparison(c)
        setPreds(p.predictions)
      })
      .catch((e) => setError(String(e)))
  }, [])

  const scatter = useMemo(
    () => preds.map((p) => ({ actual: Number(p.TARGET), predicted: Number(p.predicted), residual: Number(p.residual) })),
    [preds],
  )

  if (error) return <EmptyState title="Model comparison error" message={error} />
  if (!comparison) return <LoadingBlock />

  const models = (comparison.models as Array<Record<string, number | string>>) || []
  const exp = (comparison.experiment as Record<string, unknown>) || {}
  const modelCfg = (exp.models as Record<string, { best_params?: object; train_sec?: number }>) || {}

  if (!comparison.evaluated) {
    return <EmptyState title="Models not evaluated" message="Run python -m backend.ml.pipeline from the project root." />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Model Comparison"
        subtitle="Linear Regression, Random Forest, and XGBoost · Train 2023 · Unseen test 2024 · Tuning on 2023 only."
      />

      <ChartPanel title="Evaluation results (2024 hold-out)">
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-f1-muted">
              <tr>
                {['model', 'MAE', 'RMSE', 'R2', 'train_sec', 'status'].map((h) => (
                  <th key={h} className="p-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={String(m.model)} className="border-t border-f1-border/60">
                  <td className="p-2 font-medium">{String(m.model)}</td>
                  <td className="p-2 tabular-nums">{Number(m.MAE).toFixed(4)}</td>
                  <td className="p-2 tabular-nums">{Number(m.RMSE).toFixed(4)}</td>
                  <td className="p-2 tabular-nums">{Number(m.R2).toFixed(4)}</td>
                  <td className="p-2 tabular-nums">{modelCfg[String(m.model)]?.train_sec ?? '—'}</td>
                  <td className="p-2">{String(m.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <pre className="mt-4 max-h-40 overflow-auto rounded bg-black/30 p-3 text-xs text-f1-muted">{JSON.stringify(modelCfg, null, 2)}</pre>
      </ChartPanel>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartPanel title="Actual vs predicted (selected model, 2024)">
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid stroke="#2a303c" />
              <XAxis type="number" dataKey="actual" name="Actual" tick={{ fill: '#9aa3b2', fontSize: 11 }} />
              <YAxis type="number" dataKey="predicted" name="Predicted" tick={{ fill: '#9aa3b2', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#12151a', border: '1px solid #2a303c' }} />
              <Scatter data={scatter} fill="#e10600" fillOpacity={0.2} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Residual vs predicted">
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid stroke="#2a303c" />
              <XAxis type="number" dataKey="predicted" tick={{ fill: '#9aa3b2', fontSize: 11 }} />
              <YAxis type="number" dataKey="residual" tick={{ fill: '#9aa3b2', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#12151a', border: '1px solid #2a303c' }} />
              <Scatter data={scatter} fill="#9aa3b2" fillOpacity={0.25} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      <ChartPanel title="Model RMSE / MAE comparison">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={models.map((m) => ({ name: m.model, RMSE: Number(m.RMSE), MAE: Number(m.MAE) }))}>
            <CartesianGrid stroke="#2a303c" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#9aa3b2', fontSize: 11 }} />
            <YAxis tick={{ fill: '#9aa3b2', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#12151a', border: '1px solid #2a303c' }} />
            <Legend />
            <Bar dataKey="RMSE" fill="#e10600" />
            <Bar dataKey="MAE" fill="#f5f7fa" />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>
    </div>
  )
}
