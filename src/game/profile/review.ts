import type { Skill } from '../core/types'
import type { CountrySkills } from './profile'
import type { CountryStats } from './stats'

const DAY_MS = 86_400_000

/**
 * Leitner boxes 0 to 6. A country skill sits in a box, and the box sets how long until it is
 * asked again. Box 0 is "never answered right"; each right answer once it is due moves it up.
 */
export const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 16, 35, 90] as const
export const TOP_BOX = BOX_INTERVAL_DAYS.length - 1
/** A skill in this box or higher has been remembered across weeks. */
export const EXPERT_BOX = 4

/** Skills a Learn session asks about. */
export const LEARN_SKILLS: readonly Skill[] = ['locate', 'name', 'capital']
/** Skills a person must hold for a country to count as known by heart. */
export const CORE_SKILLS: readonly Skill[] = ['locate', 'name']

export interface ReviewState {
  box: number
  /** When it is next due; 0 means due now. */
  dueAt: number
}

/**
 * Where a skill stands. Stats saved before reviews existed have no box, so they are placed from
 * their recent answers (at most box 3) and count as due, which makes old progress get checked
 * again rather than assumed.
 */
export function reviewState(stats: CountryStats | undefined): ReviewState {
  if (!stats || stats.attempts === 0) return { box: 0, dueAt: 0 }
  if (stats.box !== undefined) return { box: stats.box, dueAt: stats.dueAt ?? 0 }
  const recentHits = stats.recent.filter(Boolean).length
  return { box: stats.hits > 0 ? Math.min(3, Math.max(1, recentHits)) : 0, dueAt: 0 }
}

/**
 * The box and due time after an answer. A right answer moves a skill up only when it is due, so
 * cramming the same country five times in one sitting does not climb the boxes. A wrong answer
 * drops it to box 1, to be asked again tomorrow.
 */
export function scheduleAfter(
  stats: CountryStats | undefined,
  success: boolean,
  at: number,
): ReviewState {
  const state = reviewState(stats)
  if (!success) return { box: 1, dueAt: at + BOX_INTERVAL_DAYS[1] * DAY_MS }
  if (state.dueAt > at) return state
  const box = Math.min(TOP_BOX, state.box + 1)
  return { box, dueAt: at + BOX_INTERVAL_DAYS[box] * DAY_MS }
}

export function isDue(stats: CountryStats | undefined, now: number): boolean {
  return reviewState(stats).dueAt <= now
}

/** A skill that has been answered right at least once, so reviewing it makes sense. */
export function isLearned(stats: CountryStats | undefined): boolean {
  return (stats?.hits ?? 0) > 0
}

export interface ReviewItem {
  countryId: string
  skill: Skill
  /** How long past due it is, in days (0 when it is only just due). */
  overdueDays: number
  box: number
}

/**
 * Learned skills that are due, the most overdue first. Skills never answered right are not
 * reviews; they belong to lessons.
 */
export function dueReviews(
  countries: Record<string, CountrySkills>,
  now: number,
  skills: readonly Skill[] = LEARN_SKILLS,
): ReviewItem[] {
  const items: ReviewItem[] = []
  for (const [countryId, held] of Object.entries(countries)) {
    for (const skill of skills) {
      const stats = held[skill]
      if (!isLearned(stats)) continue
      const { box, dueAt } = reviewState(stats)
      if (dueAt <= now) items.push({ countryId, skill, box, overdueDays: (now - dueAt) / DAY_MS })
    }
  }
  return items.sort(
    (a, b) =>
      b.overdueDays - a.overdueDays || a.box - b.box || a.countryId.localeCompare(b.countryId),
  )
}

/** The next time anything comes due, or null when nothing is waiting. */
export function nextDueAt(countries: Record<string, CountrySkills>, now: number): number | null {
  let soonest: number | null = null
  for (const held of Object.values(countries)) {
    for (const skill of LEARN_SKILLS) {
      const stats = held[skill]
      if (!isLearned(stats)) continue
      const { dueAt } = reviewState(stats)
      if (dueAt > now && (soonest === null || dueAt < soonest)) soonest = dueAt
    }
  }
  return soonest
}

/** Remembered across weeks in every core skill: the step above Mastered. */
export function isExpert(held: CountrySkills | undefined): boolean {
  return CORE_SKILLS.every((skill) => {
    const stats = held?.[skill]
    return isLearned(stats) && reviewState(stats).box >= EXPERT_BOX
  })
}

/**
 * How well a country is held, 0 to 1: each core skill counts for its box up to the expert box,
 * so a country answered right once is worth little and one remembered across weeks is worth all.
 */
export function knowledgeOf(held: CountrySkills | undefined): number {
  const total = CORE_SKILLS.reduce((sum, skill) => {
    const stats = held?.[skill]
    return sum + (isLearned(stats) ? Math.min(1, reviewState(stats).box / EXPERT_BOX) : 0)
  }, 0)
  return total / CORE_SKILLS.length
}

/** World knowledge as a share of the given countries, 0 to 1. */
export function worldKnowledge(
  countries: Record<string, CountrySkills>,
  ids: readonly string[],
): number {
  if (ids.length === 0) return 0
  return ids.reduce((sum, id) => sum + knowledgeOf(countries[id]), 0) / ids.length
}
