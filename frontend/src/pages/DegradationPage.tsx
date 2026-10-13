import { useEffect, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import { ChartPanel } from '../components/ChartPanel'
import { EmptyState } from '../components/EmptyState'
import { LoadingBlock } from '../components/LoadingBlock'
import { PageHeader } from '../components/PageHeader'

export function DegradationPage() {
  const [filters, setFilters] = useState<Record<string, (string | number)[]>>({})
  const [season, setSeason] = useState('')
  const [race, setRace] = useState('')
  const [compound, setCompound] = useState('')
  const [driver, setDriver] = useState('')
  const [stint, setStint] = useState('')
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.datasetFilters().then(setFilters).catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (season) params.set('season', season)
    if (race) params.set('race', race)
    if (compound) params.set('compound', compound)
    if (driver) params.set('driver', driver)
    if (stint) params.set('stint', stint)
    api.degradation(params).then(setData).catch((e) => setError(String(e)))
  }, [season, race, compound, driver, stint])

  if (error) return <EmptyState title="Degradation analysis error" message={error} />
  if (!data) return <LoadingBlock />

  const points = (data.points as Array<Record<string, number | string | null>>) || []
  const observedPred = points.filter((p) => p.predicted != null)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tyre Degradation Analysis"
        subtitle="Observed lap-time proxy (TARGET) from cleaned pipeline data. Predicted points appear only for matched 2024 test rows."
      />
      <section className="panel border-f1-red/30 p-4 text-sm text-f1-muted">
        <p>{String(data.target_note)}</p>
        <p className="mt-2">{String(data.observed_vs_predicted_note)}</p>
      </section>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {[
          { label: 'season', opts: filters.seasons, val: season, setVal: setSeason },
          { label: 'race', opts: filters.races, val: race, setVal: setRace },
          { label: 'compound', opts: filters.compounds, val: compound, setVal: setCompound },
          { label: 'driver', opts: filters.drivers, val: driver, setVal: setDriver },
          { label: 'stint', opts: filters.stints, val: stint, setVal: setStint },
        ].map(({ label, opts, val, setVal }) => (
          <select key={label} className="panel-inner px-3 py-2 text-sm" value={val} onChange={(e) => setVal(e.target.value)}>
            <option value="">All {label}</option>
            {(opts || []).map((s) => (
              <option key={String(s)} value={String(s)}>{s}</option>
            ))}
          </select>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartPanel title="Observed proxy vs tyre age">
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid stroke="#2a303c" />
              <XAxis type="number" dataKey="tyre_age" tick={{ fill: '#9aa3b2', fontSize: 11 }} />
              <YAxis type="number" dataKey="TARGET" tick={{ fill: '#9aa3b2', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#12151a', border: '1px solid #2a303c' }} />
              <Scatter name="Observed" data={points} fill="#e10600" fillOpacity={0.25} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartPanel>
        <ChartPanel title="Lap time vs tyre age">
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid stroke="#2a303c" />
              <XAxis type="number" dataKey="tyre_age" tick={{ fill: '#9aa3b2', fontSize: 11 }} />
              <YAxis type="number" dataKey="lap_time_sec" tick={{ fill: '#9aa3b2', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#12151a', border: '1px solid #2a303c' }} />
              <Scatter data={points} fill="#f5f7fa" fillOpacity={0.2} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      <ChartPanel title="Observed vs predicted degradation (2024 matches only)">
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart>
            <CartesianGrid stroke="#2a303c" />
            <XAxis type="number" dataKey="TARGET" name="Observed" tick={{ fill: '#9aa3b2', fontSize: 11 }} />
            <YAxis type="number" dataKey="predicted" name="Predicted" tick={{ fill: '#9aa3b2', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#12151a', border: '1px solid #2a303c' }} />
            <Legend />
            <Scatter name="Matched rows" data={observedPred} fill="#e10600" fillOpacity={0.35} />
          </ScatterChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title="Mean proxy by compound (observed)">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={(data.by_compound as Array<Record<string, number>>) || []}>
            <CartesianGrid stroke="#2a303c" />
            <XAxis dataKey="compound" tick={{ fill: '#9aa3b2', fontSize: 10 }} />
            <YAxis tick={{ fill: '#9aa3b2', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#12151a', border: '1px solid #2a303c' }} />
            <Line type="monotone" dataKey="mean_proxy" stroke="#e10600" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>
    </div>
  )
}
