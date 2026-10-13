/** Schematic track outlines for visualization (not official FIA maps). */
export type CircuitGraphic = {
  id: string
  label: string
  viewBox: string
  path: string
}

const DEFAULT: CircuitGraphic = {
  id: 'generic',
  label: 'Schematic circuit',
  viewBox: '0 0 400 220',
  path: 'M 60 110 Q 60 40 130 40 L 270 40 Q 340 40 340 110 Q 340 180 270 180 L 130 180 Q 60 180 60 110 Z',
}

const CIRCUITS: Record<string, CircuitGraphic> = {
  Silverstone: {
    id: 'silverstone',
    label: 'Silverstone (schematic)',
    viewBox: '0 0 400 260',
    path: 'M 70 180 C 40 120 50 60 120 45 C 170 35 210 55 240 40 C 290 20 340 70 330 120 C 325 150 350 170 320 200 C 270 230 210 210 170 225 C 120 245 80 220 70 180 Z',
  },
  'Monte Carlo': {
    id: 'monaco',
    label: 'Monte Carlo (schematic)',
    viewBox: '0 0 400 260',
    path: 'M 90 200 L 120 120 L 180 90 L 250 100 L 300 130 L 310 180 L 260 210 L 180 220 L 120 210 Z',
  },
  'Spa-Francorchamps': {
    id: 'spa',
    label: 'Spa (schematic)',
    viewBox: '0 0 400 260',
    path: 'M 80 200 C 60 140 90 80 150 70 L 230 55 C 300 45 340 90 330 140 C 320 190 280 220 220 215 L 150 205 C 100 200 85 220 80 200 Z',
  },
  Monza: {
    id: 'monza',
    label: 'Monza (schematic)',
    viewBox: '0 0 400 220',
    path: 'M 70 160 L 70 60 L 330 60 L 330 160 L 250 160 L 250 120 L 150 120 L 150 160 Z',
  },
  Suzuka: {
    id: 'suzuka',
    label: 'Suzuka (schematic)',
    viewBox: '0 0 400 260',
    path: 'M 200 220 C 120 220 80 170 90 120 C 100 70 150 40 200 50 C 250 60 290 90 300 130 C 310 170 280 210 240 215 C 210 218 200 220 200 220 C 200 170 240 150 260 120 C 280 90 250 60 200 55 C 160 52 130 80 125 110 C 120 140 150 170 200 220 Z',
  },
  Melbourne: {
    id: 'melbourne',
    label: 'Melbourne (schematic)',
    viewBox: '0 0 400 240',
    path: 'M 60 170 C 50 110 100 60 170 55 L 260 50 C 330 48 350 100 340 150 C 330 190 280 210 220 205 L 140 195 C 90 190 65 200 60 170 Z',
  },
}

export function getCircuitGraphic(circuitName: string): CircuitGraphic {
  if (CIRCUITS[circuitName]) return CIRCUITS[circuitName]
  const key = Object.keys(CIRCUITS).find((k) => circuitName.toLowerCase().includes(k.toLowerCase()))
  if (key) return CIRCUITS[key]
  return { ...DEFAULT, label: `${circuitName} (schematic)` }
}

export const TEAM_COLORS: Record<string, string> = {
  'Red Bull Racing': '#3671C6',
  Ferrari: '#E8002D',
  Mercedes: '#27F4D2',
  McLaren: '#FF8000',
  'Aston Martin': '#229971',
  Alpine: '#FF87BC',
  Williams: '#64C4FF',
  'Haas F1 Team': '#B6BABD',
  RB: '#6692FF',
  AlphaTauri: '#6692FF',
  'Kick Sauber': '#52E252',
  'Alfa Romeo': '#52E252',
}
