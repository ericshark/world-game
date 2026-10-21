import type { CountryFeature } from '../geo/countries'
import type { GameConfig } from './gameReducer'
import { accuracy, type CountryStats, type StatsByCountry } from './stats'

/** Countries the game may ask for under this config. */
export function targetPool(countries: CountryFeature[], config: GameConfig): CountryFeature[] {
  return countries.filter(
    ({ properties }) =>
      properties.playable &&
      (config.region === 'World' || properties.region === config.region) &&
      !(config.skipMicro && properties.isMicro),
  )
}

/**
 * How strongly weak-country practice favours a country: one that is always missed is ~20x more
 * likely than one that is always found, and unseen countries sit in between.
 */
export function practiceWeight(stats: CountryStats | undefined): number {
  if (!stats || stats.attempts === 0) return 1
  return 0.15 + 2.85 * (1 - accuracy(stats))
}

interface SelectOptions {
  /** When given, countries are weighted by practiceWeight instead of picked uniformly. */
  stats?: StatsByCountry
  random?: () => number
}

/** Picks up to `count` distinct country ids from the pool. */
export function selectTargets(
  pool: CountryFeature[],
  count: number,
  { stats, random = Math.random }: SelectOptions = {},
): string[] {
  const remaining = pool.map((feature) => ({
    id: feature.properties.id,
    weight: stats ? practiceWeight(stats[feature.properties.id]) : 1,
  }))
  const picked: string[] = []

  while (picked.length < count && remaining.length > 0) {
    const total = remaining.reduce((sum, entry) => sum + entry.weight, 0)
    let roll = random() * total
    let index = remaining.findIndex((entry) => (roll -= entry.weight) < 0)
    if (index === -1) index = remaining.length - 1 // floating-point leftovers
    picked.push(remaining[index].id)
    remaining.splice(index, 1)
  }

  return picked
}
