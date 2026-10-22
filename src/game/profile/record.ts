import type { CountryOutcome, SessionSummary } from '../core/types'
import type { Profile } from './profile'
import { recordAttempt } from './stats'

export const HISTORY_LIMIT = 300

/**
 * Adds a revealed round's outcomes to the per-country stats. Done round by round, so a game the
 * player quits early still counts for practice.
 */
export function recordOutcomes(profile: Profile, outcomes: CountryOutcome[]): Profile {
  const countries = { ...profile.countries }
  for (const { countryId, skill, success, distanceKm } of outcomes) {
    const skills = { ...countries[countryId] }
    skills[skill] = recordAttempt(skills[skill], success, distanceKm)
    countries[countryId] = skills
  }
  return { ...profile, countries }
}

export interface RecordedSession {
  profile: Profile
  /** The best score for this kind of game before this one, if any. */
  previousBest: number | null
  isPersonalBest: boolean
}

/** Adds a finished game to the history and personal bests. */
export function recordSession(profile: Profile, summary: SessionSummary): RecordedSession {
  const previousBest = profile.bests[summary.bestKey]?.score ?? null
  const isPersonalBest = previousBest === null || summary.score > previousBest
  const bests = isPersonalBest
    ? { ...profile.bests, [summary.bestKey]: { score: summary.score, at: summary.endedAt } }
    : profile.bests
  const entry = {
    mode: summary.mode,
    bestKey: summary.bestKey,
    score: summary.score,
    maxScore: summary.maxScore,
    endedAt: summary.endedAt,
  }
  const history = [...profile.history, entry].slice(-HISTORY_LIMIT)
  return { profile: { ...profile, bests, history }, previousBest, isPersonalBest }
}
