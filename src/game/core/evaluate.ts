import { geoDistance } from 'd3-geo'
import type { LonLat } from '../../geo/coords'
import { EARTH_RADIUS_KM, nearestPointOnCountry } from '../../geo/distance'
import type { GeoData } from '../../geo/facts'
import { MAX_POINTS, scoreCapitalGuess, scoreGuess, type ScoringRegion } from '../../geo/scoring'
import { rarities } from './categories'
import type {
  CapitalResult,
  CategoryChallenge,
  CategoryResult,
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
  /** Answers the player already gave this game; naming one again does not count. */
  usedAnswers?: readonly string[]
}

/** Share of a Rare Earth answer's points kept even when it is placed badly. */
const CATEGORY_PLACEMENT_FLOOR = 0.25

/** Scores a submission for any challenge; an incomplete or missing one counts as missed. */
export function evaluateChallenge(
  geo: GeoData,
  challenge: Challenge,
  given: Submission | undefined,
  options: ScoringOptions,
): RoundResult {
  // Answers arrive from players (and, online, from the network): one naming no known place
  // counts as no answer rather than reaching code that expects a real country.
  const submission =
    given?.answerId && !geo.countries.get(given.answerId)
      ? { ...given, answerId: undefined }
      : given
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
    case 'category':
      return submission?.answerId && submission.pin
        ? evaluateCategory(geo, challenge, submission.answerId, submission.pin, options)
        : missedResult(challenge.category.id)
  }
}

/**
 * A Rare Earth answer: rarer valid answers are worth more (100–1,000), scaled by how well the
 * player then placed their country, keeping at least a quarter for a valid but misplaced answer.
 */
export function evaluateCategory(
  geo: GeoData,
  { category }: CategoryChallenge,
  answerId: string,
  guess: LonLat,
  options: ScoringOptions,
): CategoryResult {
  const located = evaluateLocate(geo, answerId, guess, options)
  const reused = options.usedAnswers?.includes(answerId) ?? false
  const fits = category.valid.includes(answerId) || category.lenient.includes(answerId)
  const valid = fits && !reused
  const rarity = fits ? (rarities(category, geo).get(answerId) ?? 0) : 0
  const rarityPoints = Math.round(100 + 900 * rarity)
  const placement =
    CATEGORY_PLACEMENT_FLOOR + (1 - CATEGORY_PLACEMENT_FLOOR) * (located.points / MAX_POINTS)
  return {
    ...located,
    kind: 'category',
    answerId,
    categoryId: category.id,
    valid,
    reused,
    rarity,
    rarityPoints,
    locatePoints: located.points,
    points: valid ? Math.round(rarityPoints * placement) : 0,
    hit: valid,
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
    case 'category':
      return 'recall'
  }
}
