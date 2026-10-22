import type { LonLat } from '../../geo/coords'
import type { CountryIndex } from '../../geo/countries'
import { nearestPointOnCountry } from '../../geo/distance'
import { scoreGuess, type ScoringRegion } from '../../geo/scoring'
import type { LocateResult, MissedResult } from './types'

export function evaluateLocate(
  countries: CountryIndex,
  targetId: string,
  guess: LonLat,
  region: ScoringRegion,
): LocateResult {
  const target = countries.get(targetId)
  if (!target) throw new Error(`Unknown target country: ${targetId}`)

  const { distanceKm, nearest } = nearestPointOnCountry(guess, target)
  const { points, hit } = scoreGuess(distanceKm, target.properties, region)
  return {
    kind: 'locate',
    targetId,
    guess,
    clickedId: countries.countryAt(guess)?.properties.id ?? null,
    distanceKm,
    nearest,
    points,
    hit,
  }
}

export function missedResult(targetId: string): MissedResult {
  return { kind: 'missed', targetId, points: 0, hit: false }
}
