import type { CountryProperties, Region } from './countries'

export type ScoringRegion = Region | 'World'

export const MAX_POINTS = 1000
/** Clicks this close to a micro-state count as inside it. */
export const MICRO_HIT_RADIUS_KM = 30
/** Steepness of the falloff: >1 drops points faster early on. */
const FALLOFF_EXPONENT = 1.3

/** Distance at which a guess scores 0. Smaller regions are less forgiving. */
export const ZERO_POINTS_DISTANCE_KM: Record<ScoringRegion, number> = {
  World: 2000,
  Africa: 1500,
  Asia: 1500,
  Europe: 1000,
  'North America': 1500,
  'South America': 1500,
  Oceania: 2000,
}

export interface GuessScore {
  points: number
  /** The guess counts as inside the target country. */
  hit: boolean
}

export function scoreGuess(
  distanceKm: number,
  target: Pick<CountryProperties, 'isMicro'>,
  region: ScoringRegion,
): GuessScore {
  const hit = distanceKm === 0 || (target.isMicro && distanceKm <= MICRO_HIT_RADIUS_KM)
  if (hit) return { points: MAX_POINTS, hit }

  const remaining = Math.max(0, 1 - distanceKm / ZERO_POINTS_DISTANCE_KM[region])
  return { points: Math.round(MAX_POINTS * remaining ** FALLOFF_EXPONENT), hit }
}
