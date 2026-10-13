import { useEffect, useState, type ReactNode } from 'react'
import { Activity, Gauge, Thermometer } from 'lucide-react'

/** Animated F1 car visualization — decorative demo, not live F1 timing feed. */
export function LiveF1Car({ compact = false }: { compact?: boolean }) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1200)
    return () => window.clearInterval(id)
  }, [])

  const speed = 278 + ((tick * 17) % 35)
  const tyreAge = 1 + (tick % 24)
  const compounds = ['SOFT', 'MEDIUM', 'HARD'] as const
  const compound = compounds[tick % compounds.length]
  const trackTemp = 32 + (tick % 14)

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-f1-border/80 bg-gradient-to-br from-f1-panel via-[#0f1218] to-f1-panel-2 ${compact ? 'p-3' : 'p-5 md:p-6'
        }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_20%,rgba(225,6,0,0.18),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background:repeating-linear-gradient(90deg,transparent,transparent_40px,rgba(255,255,255,0.03)_40px,rgba(255,255,255,0.03)_41px)]" />

      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <div className="mb-2 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-f1-red opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-f1-red" />
            </span>
            <p className="font-display text-xs uppercase tracking-[0.25em] text-f1-red">Live visualization</p>
          </div>
          <h2 className={`font-display font-semibold tracking-tight text-f1-text ${compact ? 'text-lg' : 'text-2xl md:text-3xl'}`}>
            Tyre degradation telemetry lane
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-f1-muted">
            Animated research cockpit preview. Values below are simulated for UI motion only — not connected to official F1 live timing.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center sm:gap-3">
          <TelemetryChip icon={<Gauge size={14} />} label="Speed" value={`${speed} km/h`} />
          <TelemetryChip icon={<Activity size={14} />} label="Tyre age" value={`${tyreAge} laps`} />
          <TelemetryChip icon={<Thermometer size={14} />} label="Track" value={`${trackTemp}°C`} />
        </div>
      </div>

      <div className={`relative mt-5 ${compact ? 'h-16' : 'h-24 md:h-28'}`}>
        <div className="absolute inset-x-0 bottom-3 h-px bg-gradient-to-r from-transparent via-f1-red/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-2 h-[2px] rounded-full bg-f1-border/80" />
        <div className="track-glow absolute inset-x-8 bottom-2 h-1 rounded-full bg-f1-red/30 blur-sm" />

        <div className="f1-car-drive absolute bottom-0 left-0 will-change-transform">
          <F1CarSvg compound={compound} compact={compact} />
        </div>

        <div className="speed-streaks pointer-events-none absolute inset-0 overflow-hidden opacity-30">
          {Array.from({ length: 8 }).map((_, i) => (
            <span
              key={i}
              className="speed-line absolute top-1/2 h-px w-16 -translate-y-1/2 bg-gradient-to-r from-transparent to-white/40"
              style={{ left: `${i * 14}%`, animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>

      <p className="relative mt-3 text-[10px] uppercase tracking-wider text-f1-muted/80">
        Demo compound: <span className="font-display text-f1-text">{compound}</span> · Research dataset 2023–2024
      </p>
    </div>
  )
}

function TelemetryChip({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-f1-border/70 bg-black/25 px-2 py-2 backdrop-blur-sm sm:px-3">
      <div className="mb-1 flex items-center justify-center gap-1 text-f1-red">{icon}</div>
      <p className="text-[10px] uppercase tracking-wide text-f1-muted">{label}</p>
      <p className="font-display text-sm tabular-nums text-f1-text sm:text-base">{value}</p>
    </div>
  )
}

function F1CarSvg({ compound, compact }: { compound: string; compact: boolean }) {
  const w = compact ? 140 : 200
  const h = compact ? 48 : 64
  const accent = compound === 'SOFT' ? '#ff4d4d' : compound === 'HARD' ? '#e8e8e8' : '#e10600'

  return (
    <svg width={w} height={h} viewBox="0 0 200 64" fill="none" aria-hidden className="drop-shadow-[0_8px_24px_rgba(225,6,0,0.35)]">
      <ellipse cx="100" cy="58" rx="70" ry="6" fill="rgba(0,0,0,0.45)" />
      <path d="M28 42h144l-6-10H46l-10-6H28v16z" fill="#141820" stroke="#3a4252" strokeWidth="1" />
      <path d="M52 26h68l22 10H44l8-10z" fill={accent} opacity="0.95" />
      <path d="M44 36h18l-4-8H38l6 8z" fill="#f5f7fa" opacity="0.85" />
      <path d="M118 36h38l8 6h-46l0-6z" fill="#f5f7fa" opacity="0.75" />
      <rect x="78" y="22" width="8" height="10" rx="1" fill="#222831" stroke="#555" />
      <path d="M36 30h8v4H36z" fill="#e10600" className="rear-light-pulse" />
      <g className="wheel-spin origin-center" style={{ transformOrigin: '52px 44px' }}>
        <circle cx="52" cy="44" r="11" fill="#0a0a0a" stroke="#555" strokeWidth="2" />
        <circle cx="52" cy="44" r="4" fill="#888" />
      </g>
      <g className="wheel-spin origin-center" style={{ transformOrigin: '148px 44px' }}>
        <circle cx="148" cy="44" r="11" fill="#0a0a0a" stroke="#555" strokeWidth="2" />
        <circle cx="148" cy="44" r="4" fill="#888" />
      </g>
    </svg>
  )
}
