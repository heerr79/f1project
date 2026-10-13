import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { ChartPanel } from '../components/ChartPanel'
import { EmptyState } from '../components/EmptyState'
import { HistogramChart, binsToChart } from '../components/HistogramChart'
import { LoadingBlock } from '../components/LoadingBlock'
import { MetricCard } from '../components/MetricCard'
import { PageHeader } from '../components/PageHeader'

export function DatasetExplorerPage() {
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null)
  const [quality, setQuality] = useState<Record<string, unknown> | null>(null)
  const [dictionary, setDictionary] = useState<Array<Record<string, string>>>([])
  const [columns, setColumns] = useState<Array<Record<string, unknown>>>([])
  const [missing, setMissing] = useState<Array<{ column: string; count: number; pct: number }>>([])
  const [filters, setFilters] = useState<Record<string, (string | number)[]>>({})
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [total, setTotal] = useState(0)
  const [season, setSeason] = useState('')
  const [race, setRace] = useState('')
  const [driver, setDriver] = useState('')
  const [team, setTeam] = useState('')
  const [compound, setCompound] = useState('')
  const [stint, setStint] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [charts, setCharts] = useState<Record<string, Array<{ mid: number; count: number }>>>({})
  const [error, setError] = useState<string | null>(null)
  const limit = 50

  const filterParams = useMemo(() => {
    const p = new URLSearchParams({ limit: String(limit), offset: String(page * limit) })
    if (season) p.set('season', season)
    if (race) p.set('race', race)
    if (driver) p.set('driver', driver)
    if (team) p.set('team', team)
    if (compound) p.set('compound', compound)
    if (stint) p.set('stint', stint)
    if (search) p.set('search', search)
    return p
  }, [season, race, driver, team, compound, stint, search, page])

  useEffect(() => {
    Promise.all([
      api.datasetSummary(),
      api.datasetColumns(),
      api.datasetMissing(),
      api.datasetFilters(),
      api.datasetQuality(),
      api.datasetDictionary(),
    ])
      .then(([s, c, m, f, q, d]) => {
        setSummary(s)
        setColumns(c.columns)
        setMissing(m.missing)
        setFilters(f)
        setQuality(q)
        setDictionary(d.dictionary)
      })
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    api.datasetLaps(filterParams).then((r) => {
      setRows(r.rows)
      setTotal(r.total)
    })
  }, [filterParams])

  useEffect(() => {
    const cp = new URLSearchParams(filterParams)
    cp.delete('limit')
    cp.delete('offset')
    Promise.all([
      api.chartFiltered('lap_time_sec', cp),
      api.chartFiltered('tyre_age', cp),
      api.chartFiltered('track_temperature', cp),
      api.chartFiltered('humidity', cp),
    ]).then(([a, b, c, d]) => {
      setCharts({
        lap_time_sec: binsToChart(a.bins),
        tyre_age: binsToChart(b.bins),
        track_temperature: binsToChart(c.bins),
        humidity: binsToChart(d.bins),
      })
    })
  }, [filterParams])

  const exportCsv = async () => {
    const cp = new URLSearchParams(filterParams)
    cp.delete('limit')
    cp.delete('offset')
    const text = await api.datasetExport(cp)
    const blob = new Blob([text], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'f1_filtered_laps.csv'
    a.click()
  }

  if (error) return <EmptyState title="Dataset explorer error" message={error} />
  if (!summary) return <LoadingBlock />

  const shape = summary.shape as { rows: number; columns: number }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dataset Explorer"
        subtitle="Inspect real CSV schema, quality warnings, filtered distributions, and export subsets."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Shape" value={`${shape?.rows ?? '—'} × ${shape?.columns ?? '—'}`} />
        <MetricCard label="Missing cells" value={String(summary.missing_total ?? 0)} />
        <MetricCard label="Duplicate rows" value={String(summary.duplicate_rows ?? 0)} />
        <MetricCard label="Session-lap duplicates" value={String(quality?.duplicate_session_lap_keys ?? '—')} accent />
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
        <select className="panel-inner px-3 py-2 text-sm" value={season} onChange={(e) => { setSeason(e.target.value); setPage(0) }}>
          <option value="">All seasons</option>
          {(filters.seasons || []).map((s) => (
            <option key={String(s)} value={String(s)}>{s}</option>
          ))}
        </select>
        <select className="panel-inner px-3 py-2 text-sm" value={race} onChange={(e) => { setRace(e.target.value); setPage(0) }}>
          <option value="">All races</option>
          {(filters.races || []).map((s) => (
            <option key={String(s)} value={String(s)}>{s}</option>
          ))}
        </select>
        <select className="panel-inner px-3 py-2 text-sm" value={driver} onChange={(e) => { setDriver(e.target.value); setPage(0) }}>
          <option value="">All drivers</option>
          {(filters.drivers || []).map((s) => (
            <option key={String(s)} value={String(s)}>{s}</option>
          ))}
        </select>
        <select className="panel-inner px-3 py-2 text-sm" value={team} onChange={(e) => { setTeam(e.target.value); setPage(0) }}>
          <option value="">All teams</option>
          {(filters.teams || []).map((s) => (
            <option key={String(s)} value={String(s)}>{s}</option>
          ))}
        </select>
        <select className="panel-inner px-3 py-2 text-sm" value={compound} onChange={(e) => { setCompound(e.target.value); setPage(0) }}>
          <option value="">All compounds</option>
          {(filters.compounds || []).map((s) => (
            <option key={String(s)} value={String(s)}>{s}</option>
          ))}
        </select>
        <select className="panel-inner px-3 py-2 text-sm" value={stint} onChange={(e) => { setStint(e.target.value); setPage(0) }}>
          <option value="">All stints</option>
          {(filters.stints || []).map((s) => (
            <option key={String(s)} value={String(s)}>{s}</option>
          ))}
        </select>
        <input
          className="panel-inner px-3 py-2 text-sm md:col-span-2"
          placeholder="Search driver, race, team, compound…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
        />
        <button type="button" onClick={exportCsv} className="rounded-lg bg-f1-red px-4 py-2 text-sm font-semibold text-white hover:bg-f1-red-dim">
          Export filtered CSV
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartPanel title="Lap time distribution (filtered)"><HistogramChart data={charts.lap_time_sec || []} xLabel="seconds" /></ChartPanel>
        <ChartPanel title="Tyre age distribution"><HistogramChart data={charts.tyre_age || []} color="#f5f7fa" /></ChartPanel>
        <ChartPanel title="Track temperature"><HistogramChart data={charts.track_temperature || []} color="#9aa3b2" /></ChartPanel>
        <ChartPanel title="Humidity"><HistogramChart data={charts.humidity || []} color="#64748b" /></ChartPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="Data dictionary">
          <div className="max-h-64 overflow-auto text-xs">
            <table className="w-full text-left">
              <thead className="text-f1-muted"><tr><th className="p-2">Column</th><th className="p-2">Role</th><th className="p-2">Description</th></tr></thead>
              <tbody>
                {dictionary.map((d) => (
                  <tr key={d.column} className="border-t border-f1-border/50">
                    <td className="p-2 font-mono">{d.column}</td><td className="p-2">{d.role}</td><td className="p-2 text-f1-muted">{d.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartPanel>
        <ChartPanel title="Quality & leakage notes">
          <ul className="list-disc space-y-2 pl-5 text-sm text-f1-muted">
            {((quality?.warnings as string[]) || []).map((w) => <li key={w}>{w}</li>)}
            {((quality?.leakage_notes as string[]) || []).map((w) => <li key={w}>{w}</li>)}
          </ul>
          {missing.length ? (
            <div className="mt-4 text-xs">
              {missing.map((m) => (
                <div key={m.column} className="flex justify-between border-t border-f1-border/40 py-1">
                  <span>{m.column}</span><span>{m.count} ({m.pct}%)</span>
                </div>
              ))}
            </div>
          ) : null}
        </ChartPanel>
      </div>

      <ChartPanel title={`Paginated lap table (${total.toLocaleString()} rows)`}>
        <div className="mb-3 flex items-center gap-2 text-sm">
          <button type="button" disabled={page === 0} className="panel-inner px-3 py-1 disabled:opacity-40" onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span className="text-f1-muted">Page {page + 1} / {Math.max(1, Math.ceil(total / limit))}</span>
          <button type="button" disabled={(page + 1) * limit >= total} className="panel-inner px-3 py-1 disabled:opacity-40" onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-f1-panel-2 text-f1-muted">
              <tr>
                {['year', 'race', 'driver', 'team_name', 'lap_number', 'stint_number', 'compound', 'tyre_age', 'lap_time_sec'].map((h) => (
                  <th key={h} className="p-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx} className="border-t border-f1-border/50">
                  {['year', 'race', 'driver', 'team_name', 'lap_number', 'stint_number', 'compound', 'tyre_age', 'lap_time_sec'].map((k) => (
                    <td key={k} className="p-2">{String(r[k] ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartPanel>
    </div>
  )
}
