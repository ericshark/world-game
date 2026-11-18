import { scheduleAfter } from './review'

/** How a player has done on one skill for one country. */
export interface CountryStats {
  attempts: number
  hits: number
  totalKm: number
  /** The latest outcomes, newest last, for judging current mastery. */
  recent: boolean[]
  /** Review box and when it is next due (see review.ts); absent on older saved stats. */
  box?: number
  dueAt?: number
}

export type StatsByCountry = Record<string, CountryStats>

export const RECENT_OUTCOMES = 4

/** `at` (when it happened) also moves the skill through its review schedule. */
export function recordAttempt(
  stats: CountryStats | undefined,
  success: boolean,
  distanceKm = 0,
  at?: number,
): CountryStats {
  const previous = stats ?? { attempts: 0, hits: 0, totalKm: 0, recent: [] }
  const next: CountryStats = {
    attempts: previous.attempts + 1,
    hits: previous.hits + (success ? 1 : 0),
    totalKm: previous.totalKm + distanceKm,
    recent: [...previous.recent, success].slice(-RECENT_OUTCOMES),
  }
  if (at !== undefined) Object.assign(next, scheduleAfter(stats, success, at))
  return next
}

export function accuracy({ attempts, hits }: Pick<CountryStats, 'attempts' | 'hits'>): number {
  return attempts === 0 ? 0 : hits / attempts
}
