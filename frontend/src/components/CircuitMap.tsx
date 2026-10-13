import { useEffect, useMemo, useRef, useState } from 'react'
import { getCircuitGraphic, TEAM_COLORS } from '../data/circuitPaths'
import type { CarFrame } from '../lib/replayEngine'

type Props = {
  circuit: string
  cars: CarFrame[]
  focusCode?: string
}

type PlacedCar = CarFrame & { x: number; y: number }

export function CircuitMap({ circuit, cars, focusCode }: Props) {
  const pathRef = useRef<SVGPathElement>(null)
  const graphic = useMemo(() => getCircuitGraphic(circuit), [circuit])
  const [placed, setPlaced] = useState<PlacedCar[]>([])

  useEffect(() => {
    const path = pathRef.current
    if (!path) return
    const len = path.getTotalLength()
    const next = cars.map((c) => {
      const p = path.getPointAtLength(c.progress * len)
      return { ...c, x: p.x, y: p.y }
    })
    setPlaced(next)
  }, [cars, graphic.path])

  return (
    <div className="relative h-full min-h-[320px] w-full rounded-xl border border-f1-border/70 bg-black/60">
      <div className="absolute left-3 top-3 z-10 rounded-md border border-f1-border/60 bg-black/50 px-2 py-1 text-[10px] uppercase tracking-wider text-f1-muted">
        {graphic.label}
      </div>
      <svg viewBox={graphic.viewBox} className="h-full w-full" aria-label="Schematic circuit map">
        <path
          ref={pathRef}
          d={graphic.path}
          fill="none"
          stroke="#d8dde6"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.85"
        />
        <path d={graphic.path} fill="none" stroke="#e10600" strokeWidth="1" opacity="0.15" strokeDasharray="4 8" />
        {placed.map((c) => {
          const color = TEAM_COLORS[c.team_name] ?? '#f5f7fa'
          const focused = focusCode === c.code
          return (
            <g key={c.code} transform={`translate(${c.x}, ${c.y})`}>
              <circle r={focused ? 7 : 5} fill={color} stroke="#000" strokeWidth="1.5" />
              {focused ? (
                <text y={-10} textAnchor="middle" fill="#fff" fontSize="8" fontFamily="Orbitron, sans-serif">
                  {c.code}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
