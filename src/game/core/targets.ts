import type { CountryFeature } from '../../geo/countries'
import type { ScoringRegion } from '../../geo/scoring'
import { accuracy, type CountryStats, type StatsByCountry } from '../profile/stats'
import type { Random } from './random'

export interface PoolOptions {
  region: ScoringRegion
  skipMicro: boolean
}

/** Countries a game may ask for under these options. */
export function targetPool(countries: CountryFeature[], options: PoolOptions): CountryFeature[] {
  return countries.filter(
    ({ properties }) =>
      properties.playable &&
      (options.region === 'World' || properties.region === options.region) &&
      !(options.skipMicro && properties.isMicro),
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
  random: Random
  /** When given, countries are weighted by practiceWeight instead of picked uniformly. */
  stats?: StatsByCountry
}

/** Picks up to `count` distinct country ids from the pool. */
export function selectTargets(
  pool: CountryFeature[],
  count: number,
  { random, stats }: SelectOptions,
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
