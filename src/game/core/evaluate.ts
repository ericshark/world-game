import { geoDistance } from 'd3-geo'
import type { LonLat } from '../../geo/coords'
import { EARTH_RADIUS_KM, nearestPointOnCountry } from '../../geo/distance'
import type { GeoData } from '../../geo/facts'
import { MAX_POINTS, scoreCapitalGuess, scoreGuess, type ScoringRegion } from '../../geo/scoring'
import type {
  CapitalResult,
  Challenge,
  IdentifyResult,
  LocateResult,
  MissedResult,
  RoundResult,
  Skill,
  Submission,
} from './types'

/** Points for naming the target's neighbour instead: close, and worth knowing. */
export const NEIGHBOR_POINTS = 200

export interface ScoringOptions {
  region: ScoringRegion
  /** >1 is more forgiving (easy), <1 stricter (hard). */
  cutoffScale: number
}

/** Scores a submission for any challenge; an incomplete or missing one counts as missed. */
export function evaluateChallenge(
  geo: GeoData,
  challenge: Challenge,
  submission: Submission | undefined,
  options: ScoringOptions,
): RoundResult {
  switch (challenge.kind) {
    case 'locate':
      return submission?.pin
        ? evaluateLocate(geo, challenge.countryId, submission.pin, options)
        : missedResult(challenge.countryId)
    case 'capital':
      return submission?.pin
        ? evaluateCapital(geo, challenge.countryId, submission.pin, options)
        : missedResult(challenge.countryId)
    case 'identify':
      return submission?.answerId
        ? evaluateIdentify(
            geo,
            challenge.countryId,
            submission.answerId,
            Boolean(submission.hintUsed),
          )
        : missedResult(challenge.countryId)
  }
}

export function evaluateLocate(
  geo: GeoData,
  targetId: string,
  guess: LonLat,
  { region, cutoffScale }: ScoringOptions,
): LocateResult {
  const target = geo.feature(targetId)
  const { distanceKm, nearest } = nearestPointOnCountry(guess, target)
  const { points, hit } = scoreGuess(distanceKm, target.properties, region, cutoffScale)
  return {
    kind: 'locate',
    targetId,
    guess,
    clickedId: geo.countries.countryAt(guess)?.properties.id ?? null,
    distanceKm,
    nearest,
    points,
    hit,
  }
}

export function evaluateCapital(
  geo: GeoData,
  targetId: string,
  guess: LonLat,
  { region, cutoffScale }: ScoringOptions,
): CapitalResult {
  const closest = geo
    .factsOf(targetId)
    .capitals.map((capital) => ({ capital, km: geoDistance(guess, capital.at) * EARTH_RADIUS_KM }))
    .reduce((best, entry) => (entry.km < best.km ? entry : best))
  const { points, hit } = scoreCapitalGuess(closest.km, region, cutoffScale)
  return {
    kind: 'capital',
    targetId,
    capitalName: closest.capital.name,
    guess,
    clickedId: geo.countries.countryAt(guess)?.properties.id ?? null,
    distanceKm: closest.km,
    nearest: closest.capital.at,
    points,
    hit,
  }
}

export function evaluateIdentify(
  geo: GeoData,
  targetId: string,
  answerId: string,
  hintUsed: boolean,
): IdentifyResult {
  const verdict =
    answerId === targetId
      ? 'correct'
      : geo.factsOf(targetId).neighbors.includes(answerId)
        ? 'neighbor'
        : 'wrong'
  const points =
    verdict === 'correct'
      ? hintUsed
        ? MAX_POINTS / 2
        : MAX_POINTS
      : verdict === 'neighbor'
        ? NEIGHBOR_POINTS
        : 0
  return {
    kind: 'identify',
    targetId,
    answerId,
    verdict,
    hintUsed,
    points,
    hit: verdict === 'correct',
  }
}

export function missedResult(targetId: string): MissedResult {
  return { kind: 'missed', targetId, points: 0, hit: false }
}

/** The per-country skill a challenge exercises, for stats. */
export function skillOf(challenge: Challenge): Skill {
  switch (challenge.kind) {
    case 'locate':
      return 'locate'
    case 'capital':
      return 'capital'
    case 'identify':
      return 'name'
  }
}
