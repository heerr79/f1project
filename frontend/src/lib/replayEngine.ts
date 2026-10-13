export type LapRow = {
  lap_number: number
  lap_time_sec: number
  sector1_sec: number | null
  sector2_sec: number | null
  sector3_sec: number | null
  compound: string
  tyre_age: number
  track_temperature: number
  air_temperature: number
  humidity: number
  wind_speed: number
  rainfall: number
}

export type DriverSession = {
  driver: string
  code: string
  team_name: string
  driver_number: number
  laps: LapRow[]
  cumulative_times: number[]
}

export type SessionPayload = {
  year: number
  race: string
  session_key: number
  circuit: string
  max_lap: number
  weather: Record<string, number>
  drivers: DriverSession[]
  data_note: string
}

export type CarFrame = {
  driver: string
  code: string
  team_name: string
  driver_number: number
  position: number
  progress: number
  lap_number: number
  cumulative_time_sec: number
  interval_sec: number
  lap_time_sec: number
  compound: string
  tyre_age: number
  estimated_kph: number | null
  sector1_sec: number | null
  sector2_sec: number | null
  sector3_sec: number | null
}

function sectorFraction(lap: LapRow, sector: number, sectorPart: number): number {
  const s1 = lap.sector1_sec ?? 0
  const s2 = lap.sector2_sec ?? 0
  const s3 = lap.sector3_sec ?? 0
  const total = s1 + s2 + s3
  const part = Math.max(0, Math.min(1, sectorPart))
  if (total <= 0) return part
  if (sector <= 1) return (s1 * part) / total
  if (sector === 2) return (s1 + s2 * part) / total
  return (s1 + s2 + s3 * part) / total
}

export function buildFrame(session: SessionPayload, lap: number, sector: number, sectorPart: number): CarFrame[] {
  const maxLap = session.max_lap
  const L = Math.max(1, Math.min(lap, maxLap))
  const entries: Omit<CarFrame, 'position' | 'interval_sec'>[] = []

  for (const d of session.drivers) {
    const byLap = new Map(d.laps.map((x) => [x.lap_number, x]))
    let row = byLap.get(L)
    let progress = 0
    if (!row) {
      const prev = [...byLap.keys()].filter((n) => n <= L).sort((a, b) => b - a)[0]
      if (prev === undefined) continue
      row = byLap.get(prev)!
      progress = (prev - 1) / maxLap
    } else {
      progress = (L - 1 + sectorFraction(row, sector, sectorPart)) / maxLap
    }

    let cum = 0
    for (let i = 0; i < d.laps.length; i++) {
      if (d.laps[i].lap_number <= L) cum = d.cumulative_times[i]
      else break
    }

    entries.push({
      driver: d.driver,
      code: d.code,
      team_name: d.team_name,
      driver_number: d.driver_number,
      progress: Math.max(0, Math.min(0.999, progress)),
      lap_number: row.lap_number,
      cumulative_time_sec: cum,
      lap_time_sec: row.lap_time_sec,
      compound: row.compound,
      tyre_age: row.tyre_age,
      estimated_kph: row.lap_time_sec > 0 ? Math.round((3600 / row.lap_time_sec) * 5.8 * 10) / 10 : null,
      sector1_sec: row.sector1_sec,
      sector2_sec: row.sector2_sec,
      sector3_sec: row.sector3_sec,
    })
  }

  entries.sort((a, b) => a.cumulative_time_sec - b.cumulative_time_sec)
  const leader = entries[0]?.cumulative_time_sec ?? 0
  return entries.map((e, i) => ({
    ...e,
    position: i + 1,
    interval_sec: i === 0 ? 0 : Math.round((e.cumulative_time_sec - leader) * 1000) / 1000,
  }))
}

export function formatRaceTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
