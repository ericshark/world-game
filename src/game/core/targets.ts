import type { CountryFeature } from '../../geo/countries'
import type { GeoData } from '../../geo/facts'
import type { ScoringRegion } from '../../geo/scoring'
import { accuracy, type CountryStats, type StatsByCountry } from '../profile/stats'
import { shuffled, type Random } from './random'

export type Difficulty = 'easy' | 'normal' | 'hard'

export interface PoolOptions {
  region: ScoringRegion
  skipMicro: boolean
}

export interface WeightedId {
  id: string
  weight: number
}

/** Easy games still need enough countries to fill a game in small regions. */
const EASY_MIN_POOL = 12

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
 * Easy keeps the better-known half of the pool; hard keeps everything but favours obscure,
 * small countries (the hardest are ~10x as likely as the easiest). Ranking is relative to the
 * pool, so "easy Oceania" still works.
 */
export function weightByDifficulty(
  ids: string[],
  difficulty: Difficulty,
  geo: GeoData,
): WeightedId[] {
  switch (difficulty) {
    case 'normal':
      return ids.map((id) => ({ id, weight: 1 }))
    case 'easy': {
      const sorted = [...ids].sort((a, b) => geo.difficulty(a) - geo.difficulty(b))
      const count = Math.min(sorted.length, Math.max(EASY_MIN_POOL, Math.ceil(sorted.length / 2)))
      return sorted.slice(0, count).map((id) => ({ id, weight: 1 }))
    }
    case 'hard':
      return ids.map((id) => ({ id, weight: 0.2 + 2 * geo.difficulty(id) }))
  }
}

/**
 * How strongly weak-country practice favours a country: one that is always missed is ~20x more
 * likely than one that is always found, and unseen countries sit in between.
 */
export function practiceWeight(stats: CountryStats | undefined): number {
  if (!stats || stats.attempts === 0) return 1
  return 0.15 + 2.85 * (1 - accuracy(stats))
}

/** Multiplies each weight by how much the player needs practice on that country. */
export function weightByPractice(entries: WeightedId[], stats: StatsByCountry): WeightedId[] {
  return entries.map(({ id, weight }) => ({ id, weight: weight * practiceWeight(stats[id]) }))
}

/** Picks up to `count` distinct ids, each with probability proportional to its weight. */
export function pickWeighted(entries: WeightedId[], count: number, random: Random): string[] {
  const remaining = [...entries]
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

/**
 * Flags people confuse, as ISO 3166 codes. A flag round fills its options from the target's
 * group first, so Chad is offered next to Romania rather than next to Japan.
 */
export const LOOK_ALIKE_FLAGS: readonly (readonly string[])[] = [
  ['TD', 'RO', 'AD', 'MD'],
  ['ID', 'MC', 'PL'],
  ['IE', 'CI', 'IT', 'MX'],
  ['NL', 'LU', 'RU', 'SK', 'SI', 'HR', 'RS'],
  ['AU', 'NZ'],
  ['NO', 'IS', 'DK', 'SE', 'FI'],
  ['VE', 'CO', 'EC'],
  ['SN', 'ML', 'GN', 'GH', 'CM', 'BF'],
  ['US', 'LR', 'MY'],
  ['SA', 'PK'],
  ['BD', 'JP', 'PW'],
  ['AT', 'LV', 'PE'],
  ['EG', 'SY', 'YE', 'IQ', 'SD'],
  ['HT', 'LI'],
  ['BO', 'LT', 'ET'],
]

/** Countries whose flags are easily taken for the target's, in group order. */
export function lookAlikes(geo: GeoData, targetId: string): string[] {
  const code = geo.factsOf(targetId).iso2
  const byCode = new Map(geo.playableIds.map((id) => [geo.factsOf(id).iso2, id]))
  return LOOK_ALIKE_FLAGS.filter((group) => group.includes(code))
    .flatMap((group) => group.filter((other) => other !== code))
    .map((other) => byCode.get(other))
    .filter((id): id is string => id !== undefined)
}

/**
 * Multiple-choice options for picking a country's flag: the answer plus decoys, preferring
 * look-alike flags, then neighbours and countries from the same part of the world.
 */
export function flagChoices(geo: GeoData, targetId: string, random: Random, count = 4): string[] {
  // The most confusable flag (first in its group) is always offered; a second is chosen at random.
  const [closest, ...others] = lookAlikes(geo, targetId)
  const alikes = closest === undefined ? [] : [closest, ...shuffled(others, random).slice(0, 1)]
  const rest = nameChoices(geo, targetId, random, geo.playableIds.length).filter(
    (id) => id !== targetId && !alikes.includes(id),
  )
  return shuffled([targetId, ...[...alikes, ...rest].slice(0, count - 1)], random)
}

/**
 * Multiple-choice options for naming a country: the answer plus plausible decoys, preferring
 * neighbours and countries from the same part of the world.
 */
export function nameChoices(geo: GeoData, targetId: string, random: Random, count = 4): string[] {
  const facts = geo.factsOf(targetId)
  const region = geo.feature(targetId).properties.region
  const others = geo.playableIds.filter((id) => id !== targetId)
  const candidates = [
    ...shuffled(facts.neighbors, random).slice(0, 2),
    ...shuffled(
      others.filter((id) => geo.factsOf(id).subregion === facts.subregion),
      random,
    ),
    ...shuffled(
      others.filter((id) => geo.feature(id).properties.region === region),
      random,
    ),
    ...shuffled(others, random),
  ]
  const decoys = [...new Set(candidates)].slice(0, count - 1)
  return shuffled([targetId, ...decoys], random)
}
