import type { Skill } from '../core/types'
import { createRandom, shuffled } from '../core/random'
import { dueReviews, isLearned, reviewState } from '../profile/review'
import type { CountrySkills } from '../profile/profile'
import type { Lesson } from './curriculum'

/** One question of a Learn session. */
export interface LearnItem {
  countryId: string
  skill: Extract<Skill, 'locate' | 'name' | 'capital' | 'flag'>
  /** Offer multiple choice (naming) because it is new or was just forgotten. */
  assist: boolean
}

/** Questions in a session, not counting the re-asked misses. */
export const SESSION_SIZE = 15
/** Reviews that may ride along with a lesson. */
const LESSON_REVIEWS = 5

const LESSON_SKILLS: LearnItem['skill'][] = ['locate', 'name', 'capital', 'flag']

interface QueueOptions {
  countries: Record<string, CountrySkills>
  now: number
  seed: string
  /** The lesson to teach; without one the session only reviews what is due. */
  lesson?: Lesson
}

/**
 * A session's questions. A lesson asks every skill of its countries that has never been
 * answered right, then adds a few due reviews. A review session asks the most overdue skills.
 * Questions are mixed so the same country never comes twice in a row where it can be avoided.
 */
export function buildQueue({ countries, now, seed, lesson }: QueueOptions): LearnItem[] {
  const random = createRandom(seed)
  const reviews = dueReviews(countries, now)

  if (!lesson) {
    return reviews.slice(0, SESSION_SIZE).map((item) => ({
      countryId: item.countryId,
      skill: item.skill as LearnItem['skill'],
      assist: item.box <= 1 && (item.skill === 'name' || item.skill === 'flag'),
    }))
  }

  const fresh: LearnItem[] = lesson.ids.flatMap((countryId) =>
    LESSON_SKILLS.filter((skill) => !isLearned(countries[countryId]?.[skill])).map((skill) => ({
      countryId,
      skill,
      assist: skill === 'name' || skill === 'flag',
    })),
  )
  const taught = new Set(fresh.map((item) => `${item.countryId}:${item.skill}`))
  const extra = reviews
    .filter((item) => !taught.has(`${item.countryId}:${item.skill}`))
    .slice(0, LESSON_REVIEWS)
    .map((item) => ({
      countryId: item.countryId,
      skill: item.skill as LearnItem['skill'],
      assist: item.box <= 1 && (item.skill === 'name' || item.skill === 'flag'),
    }))
  return separateRepeats(
    shuffled([...fresh, ...extra], random).slice(0, SESSION_SIZE + LESSON_REVIEWS),
  )
}

/** Moves questions about the same country apart, keeping the order otherwise. */
export function separateRepeats(items: LearnItem[]): LearnItem[] {
  const result: LearnItem[] = []
  const waiting = [...items]
  while (waiting.length > 0) {
    const last = result[result.length - 1]
    const index = waiting.findIndex((item) => item.countryId !== last?.countryId)
    result.push(...waiting.splice(index === -1 ? 0 : index, 1))
  }
  return result
}

/** Skills whose answer the player has already learned, for the "weak spot" summary. */
export function boxOf(countries: Record<string, CountrySkills>, item: LearnItem): number {
  return reviewState(countries[item.countryId]?.[item.skill]).box
}

export interface ConfusedPair {
  a: string
  b: string
  /** Times either was taken for the other. */
  times: number
}

/** Pairs of countries the player mixes up, either way round, the most frequent first. */
export function confusedPairs(confusions: Record<string, number>): ConfusedPair[] {
  const pairs = new Map<string, ConfusedPair>()
  for (const [key, times] of Object.entries(confusions)) {
    const [x, y] = key.split('>')
    const [a, b] = x < y ? [x, y] : [y, x]
    const pair = pairs.get(`${a}>${b}`) ?? { a, b, times: 0 }
    pair.times += times
    pairs.set(`${a}>${b}`, pair)
  }
  return [...pairs.values()].sort((p, q) => q.times - p.times || p.a.localeCompare(q.a))
}

/** The most frequent pairs of a mix-up drill, so one session stays about the size of a lesson. */
export const MIXUP_PAIRS = 4

/** Finds and names both countries of each of the most confused pairs, side by side. */
export function mixupQueue(confusions: Record<string, number>, seed: string): LearnItem[] {
  const items = confusedPairs(confusions)
    .slice(0, MIXUP_PAIRS)
    .flatMap(({ a, b }): LearnItem[] => [
      { countryId: a, skill: 'locate', assist: false },
      { countryId: b, skill: 'locate', assist: false },
      { countryId: a, skill: 'name', assist: true },
      { countryId: b, skill: 'name', assist: true },
    ])
  return separateRepeats(shuffled(items, createRandom(seed)))
}

/** Every country of a region, found once, in a seeded random order, with no help. */
export function examQueue(ids: readonly string[], seed: string): LearnItem[] {
  return shuffled(ids, createRandom(seed)).map((countryId) => ({
    countryId,
    skill: 'locate',
    assist: false,
  }))
}
