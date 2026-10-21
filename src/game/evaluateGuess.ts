import type { LonLat } from '../geo/coords'
import type { CountryIndex } from '../geo/countries'
import { nearestPointOnCountry } from '../geo/distance'
import { scoreGuess, type ScoringRegion } from '../geo/scoring'
import type { RoundResult } from './gameReducer'

export function evaluateGuess(
  countries: CountryIndex,
  targetId: string,
  guess: LonLat,
  region: ScoringRegion,
): RoundResult {
  const target = countries.get(targetId)
  if (!target) throw new Error(`Unknown target country: ${targetId}`)

  const { distanceKm, nearest } = nearestPointOnCountry(guess, target)
  const { points, hit } = scoreGuess(distanceKm, target.properties, region)
  return {
    targetId,
    guess,
    clickedId: countries.countryAt(guess)?.properties.id ?? null,
    distanceKm,
    nearest,
    points,
    hit,
  }
}
