import type { CountryProperties, Region } from './countries'

export type ScoringRegion = Region | 'World'

export const MAX_POINTS = 1000
/** Clicks this close to a micro-state count as inside it. */
export const MICRO_HIT_RADIUS_KM = 30
/** Clicks this close to a capital count as on it. */
export const CAPITAL_HIT_RADIUS_KM = 25
/** Steepness of the falloff: >1 drops points faster early on. */
const FALLOFF_EXPONENT = 1.3

/** Distance at which a country guess scores 0. Smaller regions are less forgiving. */
export const ZERO_POINTS_DISTANCE_KM: Record<ScoringRegion, number> = {
  World: 2000,
  Africa: 1500,
  Asia: 1500,
  Europe: 1000,
  'North America': 1500,
  'South America': 1500,
  Oceania: 2000,
}

/** Distance at which a capital guess scores 0: cities are points, so the scale is tighter. */
export const CAPITAL_ZERO_POINTS_DISTANCE_KM: Record<ScoringRegion, number> = {
  World: 1000,
  Africa: 750,
  Asia: 750,
  Europe: 500,
  'North America': 750,
  'South America': 750,
  Oceania: 1000,
}

export interface GuessScore {
  points: number
  /** The guess counts as on target. */
  hit: boolean
}

/**
 * @param cutoffScale stretches (easy) or shrinks (hard) the distance at which points reach 0.
 * @param zeroPointsKm overrides the region's zero-points distance (used by state/province packs).
 */
export function scoreGuess(
  distanceKm: number,
  target: Pick<CountryProperties, 'isMicro'>,
  region: ScoringRegion,
  cutoffScale = 1,
  zeroPointsKm?: number,
): GuessScore {
  const hit = distanceKm === 0 || (target.isMicro && distanceKm <= MICRO_HIT_RADIUS_KM)
  if (hit) return { points: MAX_POINTS, hit }
  const baseKm = zeroPointsKm ?? ZERO_POINTS_DISTANCE_KM[region]
  return { points: falloff(distanceKm, baseKm * cutoffScale), hit }
}

export function scoreCapitalGuess(
  distanceKm: number,
  region: ScoringRegion,
  cutoffScale = 1,
): GuessScore {
  if (distanceKm <= CAPITAL_HIT_RADIUS_KM) return { points: MAX_POINTS, hit: true }
  const zeroAt = CAPITAL_ZERO_POINTS_DISTANCE_KM[region] * cutoffScale
  return { points: falloff(distanceKm - CAPITAL_HIT_RADIUS_KM, zeroAt), hit: false }
}

function falloff(distanceKm: number, zeroAtKm: number): number {
  const remaining = Math.max(0, 1 - distanceKm / zeroAtKm)
  return Math.round(MAX_POINTS * remaining ** FALLOFF_EXPONENT)
}
