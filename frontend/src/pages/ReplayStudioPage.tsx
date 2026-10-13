import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import { CircuitMap } from '../components/CircuitMap'
import { EmptyState } from '../components/EmptyState'
import { LoadingBlock } from '../components/LoadingBlock'
import { TEAM_COLORS } from '../data/circuitPaths'
import { buildFrame, formatRaceTime, type CarFrame, type SessionPayload } from '../lib/replayEngine'

type SessionMeta = {
  year: number
  race: string
  circuit: string
  session_key: number
  max_lap: number
}

export function ReplayStudioPage() {
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [selected, setSelected] = useState<SessionMeta | null>(null)
  const [session, setSession] = useState<SessionPayload | null>(null)
  const [lap, setLap] = useState(1)
  const [sector, setSector] = useState(1)
  const [sectorPart, setSectorPart] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(4)
  const [focusCode, setFocusCode] = useState<string | undefined>('VER')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .replaySessions()
      .then((r) => {
        const list = (r.sessions as SessionMeta[]) || []
        setSessions(list)
        const preferred = list.find((s) => s.year === 2024 && s.race === 'United Kingdom') ?? list[0]
        if (preferred) setSelected(preferred)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selected) return
    setLoading(true)
    api
      .replaySession(selected.year, selected.race, selected.session_key)
      .then((s) => {
        setSession(s as SessionPayload)
        setLap(1)
        setSector(1)
        setSectorPart(0)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [selected])

  const frame = useMemo(() => {
    if (!session) return []
    return buildFrame(session, lap, sector, sectorPart)
  }, [session, lap, sector, sectorPart])

  const focusDrivers = useMemo(() => {
    const pick = frame.filter((c) => ['VER', 'HAM', 'NOR', 'PIA', 'LEC', 'SAI'].includes(c.code)).slice(0, 3)
    if (pick.length >= 3) return pick
    return frame.slice(0, 3)
  }, [frame])

  const leaderTime = frame[0]?.cumulative_time_sec ?? 0

  const tick = useCallback(() => {
    setSectorPart((p) => {
      let next = p + 0.08 * speed
      if (next < 1) return next
      setSector((s) => {
        if (s < 3) return s + 1
        setLap((l) => {
          const max = session?.max_lap ?? l
          if (l >= max) {
            setPlaying(false)
            return l
          }
          return l + 1
        })
        return 1
      })
      return 0
    })
  }, [session?.max_lap, speed])

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(tick, 120)
    return () => window.clearInterval(id)
  }, [playing, tick])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        setPlaying((p) => !p)
      }
      if (e.key.toLowerCase() === 'r') {
        setLap(1)
        setSector(1)
        setSectorPart(0)
        setPlaying(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (error) return <EmptyState title="Replay studio unavailable" message={error} />
  if (loading && !session) return <LoadingBlock />

  return (
    <div className="space-y-4">
      <section className="panel panel-glow p-4 md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-display text-[10px] uppercase tracking-[0.35em] text-f1-red">Lap-data replay studio</p>
            <h2 className="font-display text-2xl font-semibold">Race telemetry board</h2>
            <p className="mt-2 max-w-3xl text-sm text-f1-muted">
              Layout inspired by professional F1 replay tools. Positions are estimated from your CSV lap/sector times on a schematic track —
              not official GPS or live timing feeds.
            </p>
          </div>
          <select
            className="panel-inner min-w-[260px] px-3 py-2 text-sm"
            value={selected ? `${selected.year}|${selected.race}|${selected.session_key}` : ''}
            onChange={(e) => {
              const [year, race, session_key] = e.target.value.split('|')
              const s = sessions.find(
                (x) => x.year === Number(year) && x.race === race && x.session_key === Number(session_key),
              )
              if (s) setSelected(s)
            }}
          >
            {sessions.map((s) => (
              <option key={`${s.year}-${s.race}-${s.session_key}`} value={`${s.year}|${s.race}|${s.session_key}`}>
                {s.year} · {s.race} · {s.circuit} (session {s.session_key})
              </option>
            ))}
          </select>
        </div>
      </section>

      {session ? (
        <div className="grid gap-4 xl:grid-cols-[260px_1fr_220px]">
          {/* Left telemetry stack */}
          <div className="space-y-3">
            <InfoBlock title={`Lap ${lap} / ${session.max_lap}`} value={`Race time ${formatRaceTime(leaderTime)} (x${speed.toFixed(1)})`} />
            <WeatherBlock weather={session.weather} />
            {focusDrivers.map((d) => (
              <DriverCard key={d.code} driver={d} onFocus={() => setFocusCode(d.code)} active={focusCode === d.code} />
            ))}
          </div>

          {/* Center map */}
          <div className="panel panel-glow p-3 md:p-4">
            <CircuitMap circuit={session.circuit} cars={frame} focusCode={focusCode} />
          </div>

          {/* Leaderboard */}
          <div className="panel panel-glow p-3">
            <p className="mb-2 text-xs uppercase tracking-wider text-f1-muted">Leaderboard</p>
            <ul className="max-h-[520px] space-y-1 overflow-y-auto text-sm">
              {frame.map((d) => (
                <li
                  key={d.code}
                  className={`flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 transition ${
                    focusCode === d.code ? 'bg-f1-red/15' : 'hover:bg-f1-panel-2'
                  }`}
                  onClick={() => setFocusCode(d.code)}
                >
                  <span style={{ color: TEAM_COLORS[d.team_name] ?? '#fff' }}>
                    {d.position}. {d.code}
                  </span>
                  <span className="tabular-nums text-f1-muted">{d.interval_sec > 0 ? `+${d.interval_sec.toFixed(1)}s` : 'LEAD'}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {/* Controls */}
      <div className="panel panel-glow flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
        <div className="text-xs text-f1-muted">
          <p className="font-display uppercase tracking-wider text-f1-text">Controls</p>
          <p className="mt-1">Space: play/pause · R: restart · Click driver to focus on map</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ControlBtn onClick={() => setLap((l) => Math.max(1, l - 1))} icon={<SkipBack size={16} />} />
          <ControlBtn
            onClick={() => setPlaying((p) => !p)}
            icon={playing ? <Pause size={16} /> : <Play size={16} />}
            accent
          />
          <ControlBtn onClick={() => setLap((l) => Math.min(session?.max_lap ?? l, l + 1))} icon={<SkipForward size={16} />} />
          <ControlBtn
            onClick={() => {
              setLap(1)
              setSector(1)
              setSectorPart(0)
              setPlaying(false)
            }}
            icon={<RotateCcw size={16} />}
          />
          <div className="ml-2 flex items-center gap-2 rounded-lg border border-f1-border px-2 py-1 text-sm">
            <button type="button" className="px-2" onClick={() => setSpeed((s) => Math.max(1, s - 1))}>
              −
            </button>
            <span className="font-display tabular-nums">{speed.toFixed(1)}x</span>
            <button type="button" className="px-2" onClick={() => setSpeed((s) => Math.min(12, s + 1))}>
              +
            </button>
          </div>
        </div>
        <input
          type="range"
          min={1}
          max={session?.max_lap ?? 1}
          value={lap}
          className="w-full md:max-w-md"
          onChange={(e) => {
            setLap(Number(e.target.value))
            setSector(1)
            setSectorPart(0)
          }}
        />
      </div>

      {session?.data_note ? <p className="text-center text-[11px] text-f1-muted">{session.data_note}</p> : null}
    </div>
  )
}

function InfoBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-f1-border/70 bg-black/40 p-3">
      <p className="text-xs uppercase tracking-wider text-f1-muted">{title}</p>
      <p className="font-display mt-1 text-sm tabular-nums">{value}</p>
    </div>
  )
}

function WeatherBlock({ weather }: { weather: Record<string, number> }) {
  return (
    <div className="rounded-xl border border-f1-border/70 bg-black/40 p-3 text-xs">
      <p className="mb-2 uppercase tracking-wider text-f1-muted">Track conditions (CSV)</p>
      <div className="grid grid-cols-2 gap-2 tabular-nums">
        <span>Track {weather.track_temperature}°C</span>
        <span>Air {weather.air_temperature}°C</span>
        <span>Humidity {weather.humidity}%</span>
        <span>Wind {weather.wind_speed} km/h</span>
        <span className="col-span-2">{weather.rainfall ? 'WET' : 'DRY'}</span>
      </div>
    </div>
  )
}

function DriverCard({ driver, onFocus, active }: { driver: CarFrame; onFocus: () => void; active: boolean }) {
  const color = TEAM_COLORS[driver.team_name] ?? '#fff'
  const s1 = driver.sector1_sec ?? 0
  const s2 = driver.sector2_sec ?? 0
  const s3 = driver.sector3_sec ?? 0
  const total = s1 + s2 + s3 || 1

  return (
    <button
      type="button"
      onClick={onFocus}
      className={`w-full rounded-xl border p-3 text-left transition ${active ? 'border-f1-red/50 bg-f1-red/10' : 'border-f1-border/70 bg-black/40 hover:bg-f1-panel-2'}`}
    >
      <div className="flex items-center justify-between">
        <span className="font-display font-semibold" style={{ color }}>
          {driver.code}
        </span>
        <span className="text-xs text-f1-muted">{driver.compound}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs tabular-nums">
        <div>
          <p className="text-f1-muted">Est. pace</p>
          <p className="font-display text-base">{driver.estimated_kph ?? '—'} kph</p>
        </div>
        <div>
          <p className="text-f1-muted">Tyre age</p>
          <p className="font-display text-base">{driver.tyre_age} laps</p>
        </div>
        <div className="col-span-2">
          <p className="text-f1-muted">Lap time</p>
          <p className="font-display">{driver.lap_time_sec.toFixed(3)}s</p>
        </div>
      </div>
      <div className="mt-2">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-f1-muted">Sector split (available CSV data)</p>
        <div className="flex h-2 overflow-hidden rounded-full bg-f1-border/50">
          <div className="bg-emerald-500/80" style={{ width: `${(s1 / total) * 100}%` }} />
          <div className="bg-amber-400/80" style={{ width: `${(s2 / total) * 100}%` }} />
          <div className="bg-sky-400/80" style={{ width: `${(s3 / total) * 100}%` }} />
        </div>
      </div>
    </button>
  )
}

function ControlBtn({ onClick, icon, accent }: { onClick: () => void; icon: ReactNode; accent?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-2 transition ${accent ? 'border-f1-red bg-f1-red/20' : 'border-f1-border bg-f1-panel-2 hover:border-f1-red/40'}`}
    >
      {icon}
    </button>
  )
}
