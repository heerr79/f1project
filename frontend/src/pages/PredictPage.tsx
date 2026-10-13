import { useState } from 'react'
import { api } from '../api/client'
import { EmptyState } from '../components/EmptyState'
import { MetricCard } from '../components/MetricCard'
import { PageHeader } from '../components/PageHeader'

const defaultForm = {
  compound: 'MEDIUM',
  tyre_age: 8,
  lap_number: 20,
  stint_number: 2,
  tyre_age_at_start: 0,
  previous_lap_time: 89.5,
  track_temperature: 35,
  air_temperature: 24,
  humidity: 55,
  wind_speed: 1.5,
  rainfall: 0,
}

export function PredictPage() {
  const [form, setForm] = useState(defaultForm)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const payload = {
        ...form,
        rolling_prev_lap_time_mean_3: form.previous_lap_time,
        rolling_prev_lap_time_std_3: 0,
        tyre_age_squared: form.tyre_age ** 2,
      }
      const res = await api.predict(payload)
      setResult(res)
    } catch (err) {
      setError(String(err))
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Interactive Prediction"
        subtitle="Run the trained model and conformal interval pipeline on your inputs. Sector times are not in the current feature schema."
      />

      <form onSubmit={onSubmit} className="panel panel-glow grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
        {(
          [
            ['compound', 'text'],
            ['tyre_age', 'number'],
            ['lap_number', 'number'],
            ['stint_number', 'number'],
            ['tyre_age_at_start', 'number'],
            ['previous_lap_time', 'number'],
            ['track_temperature', 'number'],
            ['air_temperature', 'number'],
            ['humidity', 'number'],
            ['wind_speed', 'number'],
            ['rainfall', 'number'],
          ] as const
        ).map(([key, type]) => (
          <label key={key} className="text-sm">
            <span className="mb-1 block text-f1-muted">{key}</span>
            <input
              className="panel-inner w-full px-3 py-2.5 text-f1-text outline-none transition focus:border-f1-red/50 focus:ring-1 focus:ring-f1-red/30"
              type={type}
              step="any"
              value={String(form[key as keyof typeof form])}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  [key]: type === 'number' ? Number(e.target.value) : e.target.value,
                }))
              }
            />
          </label>
        ))}
        <div className="md:col-span-2 xl:col-span-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-f1-red px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-f1-red-dim disabled:opacity-60"
          >
            {loading ? 'Predicting…' : 'Predict Degradation'}
          </button>
        </div>
      </form>

      {error ? <EmptyState title="Prediction unavailable" message={error} /> : null}

      {result ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Predicted proxy" value={Number(result.predicted_degradation_proxy).toFixed(4)} accent />
            <MetricCard label="Lower bound (90%)" value={Number(result.lower_bound_90).toFixed(4)} />
            <MetricCard label="Upper bound (90%)" value={Number(result.upper_bound_90).toFixed(4)} />
            <MetricCard label="Interval width" value={Number(result.interval_width).toFixed(4)} />
          </div>
          <section className="panel p-5 text-sm text-f1-muted">
            <p>
              <strong className="text-f1-text">Model:</strong> {String(result.model_version)}
            </p>
            <p className="mt-2">{String(result.uncertainty_note)}</p>
          </section>
        </>
      ) : null}
    </div>
  )
}
