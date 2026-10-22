import type { CountryPaint } from '../../globe/scene'

/** Hot (red) when close to the mystery country, cooling to blue far away. */
const STEPS: { maxKm: number; color: string; label: string }[] = [
  { maxKm: 0, color: '#ff3b30', label: 'Neighbour!' },
  { maxKm: 500, color: '#ff6a2b', label: 'Burning' },
  { maxKm: 1500, color: '#ff9f43', label: 'Hot' },
  { maxKm: 3000, color: '#ffd54a', label: 'Warm' },
  { maxKm: 6000, color: '#d9e3a0', label: 'Cool' },
  { maxKm: Infinity, color: '#7fa7d9', label: 'Cold' },
]

export function heatOf(distanceKm: number) {
  return STEPS.find((step) => distanceKm <= step.maxKm)!
}

export function heatPaint(id: string, distanceKm: number): CountryPaint {
  const { color } = heatOf(distanceKm)
  return { id, fill: `${color}66`, stroke: color, lineWidth: 2 }
}
