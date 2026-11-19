import { cityKey, type CityIndex } from '../../geo/cities'
import { subPlaceKey, type SubPackId, type SubdivisionPack } from '../../geo/subdivisions'
import type { Skill } from '../core/types'
import { createRandom, shuffled } from '../core/random'
import {
  duePlaceReviews,
  dueReviews,
  dueSubReviews,
  isLearned,
  reviewState,
} from '../profile/review'
import type { CountrySkills } from '../profile/profile'
import type { CountryStats } from '../profile/stats'
import type { CityDeck, Lesson, SubLesson } from './curriculum'

export interface CountryLearnItem {
  countryId: string
  skill: Extract<Skill, 'locate' | 'name' | 'capital' | 'flag'>
  /** Offer multiple choice (naming) because it is new or was just forgotten. */
  assist: boolean
}

export interface CityLearnItem {
  cityId: string
  countryId: string
  skill: 'city'
  assist: false
}

export interface SubLearnItem {
  unitId: string
  packId: SubPackId
  countryId: SubPackId
  skill: 'locate' | 'name'
  assist: boolean
}

/** One question of a Learn session. */
export type LearnItem = CountryLearnItem | CityLearnItem | SubLearnItem

/** Questions in a session, not counting the re-asked misses. */
export const SESSION_SIZE = 15
/** Reviews that may ride along with a lesson. */
const LESSON_REVIEWS = 5

const LESSON_SKILLS: CountryLearnItem['skill'][] = ['locate', 'name', 'capital', 'flag']

interface QueueOptions {
  countries: Record<string, CountrySkills>
  places?: Record<string, CountryStats>
  cities?: CityIndex
  subdivisions?: Partial<Record<SubPackId, SubdivisionPack>>
  now: number
  seed: string
  /** The lesson to teach; without one the session only reviews what is due. */
  lesson?: Lesson
}

/**
 * A session's questions. A lesson asks every skill of its countries that has never been
 * answered right, then adds a few due reviews. A review session asks the most overdue skills
 * across countries, major cities and states/provinces. Questions are mixed so the same place
 * never comes twice in a row where it can be avoided.
 */
export function buildQueue({
  countries,
  places = {},
  cities,
  subdivisions,
  now,
  seed,
  lesson,
}: QueueOptions): LearnItem[] {
  const random = createRandom(seed)
  const countryDue = dueReviews(countries, now).map((item) => ({
    overdueDays: item.overdueDays,
    box: item.box,
    sortKey: item.countryId,
    item: {
      countryId: item.countryId,
      skill: item.skill as CountryLearnItem['skill'],
      assist: item.box <= 1 && (item.skill === 'name' || item.skill === 'flag'),
    } satisfies LearnItem,
  }))

  if (!lesson) {
    const cityDue = cities
      ? duePlaceReviews(places, now).flatMap((item) => {
          const city = cities.get(item.cityId)
          return city
            ? [
                {
                  overdueDays: item.overdueDays,
                  box: item.box,
                  sortKey: item.cityId,
                  item: {
                    cityId: city.id,
                    countryId: city.countryId,
                    skill: 'city' as const,
                    assist: false as const,
                  } satisfies LearnItem,
                },
              ]
            : []
        })
      : []
    const subDue = subdivisions
      ? dueSubReviews(places, now).flatMap((item) => {
          const pack = subdivisions[item.packId]
          return pack && pack.countries.get(item.unitId)
            ? [
                {
                  overdueDays: item.overdueDays,
                  box: item.box,
                  sortKey: `${item.packId}:${item.unitId}`,
                  item: {
                    unitId: item.unitId,
                    packId: item.packId,
                    countryId: item.packId,
                    skill: 'locate' as const,
                    assist: false,
                  } satisfies LearnItem,
                },
              ]
            : []
        })
      : []
    return [...countryDue, ...cityDue, ...subDue]
      .sort(
        (a, b) =>
          b.overdueDays - a.overdueDays || a.box - b.box || a.sortKey.localeCompare(b.sortKey),
      )
      .slice(0, SESSION_SIZE)
      .map((entry) => entry.item)
  }

  const fresh: LearnItem[] = lesson.ids.flatMap((countryId) =>
    LESSON_SKILLS.filter((skill) => !isLearned(countries[countryId]?.[skill])).map((skill) => ({
      countryId,
      skill,
      assist: skill === 'name' || skill === 'flag',
    })),
  )
  const taught = new Set(fresh.map((item) => `${item.countryId}:${item.skill}`))
  const extra = countryDue
    .filter(({ item }) => !taught.has(`${item.countryId}:${item.skill}`))
    .slice(0, LESSON_REVIEWS)
    .map(({ item }) => item)
  return separateRepeats(
    shuffled([...fresh, ...extra], random).slice(0, SESSION_SIZE + LESSON_REVIEWS),
  )
}

/** Questions for a major-city deck: unlearned cities first, or the whole deck once finished. */
export function buildCityDeckQueue(
  deck: CityDeck,
  cities: CityIndex,
  places: Record<string, CountryStats>,
  seed: string,
): LearnItem[] {
  const unlearned = deck.cityIds.filter((id) => !isLearned(places[cityKey(id)]))
  const ask = unlearned.length > 0 ? unlearned : deck.cityIds
  const items: CityLearnItem[] = ask.flatMap((cityId) => {
    const city = cities.get(cityId)
    return city
      ? [{ cityId: city.id, countryId: city.countryId, skill: 'city', assist: false }]
      : []
  })
  return shuffled(items, createRandom(seed))
}

/** Questions for a state/province lesson: find and name unlearned units first, or the whole lesson once finished. */
export function buildSubLessonQueue(
  lesson: SubLesson,
  places: Record<string, CountryStats>,
  seed: string,
): LearnItem[] {
  const unlearned = lesson.unitIds.filter(
    (id) => !isLearned(places[subPlaceKey(lesson.packId, id)]),
  )
  const ask = unlearned.length > 0 ? unlearned : lesson.unitIds
  const items: SubLearnItem[] = ask.flatMap((unitId): SubLearnItem[] => [
    { unitId, packId: lesson.packId, countryId: lesson.packId, skill: 'locate', assist: false },
    { unitId, packId: lesson.packId, countryId: lesson.packId, skill: 'name', assist: true },
  ])
  return separateRepeats(shuffled(items, createRandom(seed)))
}

function subjectOf(item: LearnItem): string {
  if ('packId' in item) return `${item.packId}:${item.unitId}`
  return item.skill === 'city' ? item.cityId : item.countryId
}

/** Moves questions about the same country or city apart, keeping the order otherwise. */
export function separateRepeats(items: LearnItem[]): LearnItem[] {
  const result: LearnItem[] = []
  const waiting = [...items]
  while (waiting.length > 0) {
    const last = result[result.length - 1]
    const index = waiting.findIndex((item) => !last || subjectOf(item) !== subjectOf(last))
    result.push(...waiting.splice(index === -1 ? 0 : index, 1))
  }
  return result
}

/** Skills whose answer the player has already learned, for the "weak spot" summary. */
export function boxOf(
  countries: Record<string, CountrySkills>,
  item: LearnItem,
  places: Record<string, CountryStats> = {},
): number {
  if ('packId' in item) return reviewState(places[subPlaceKey(item.packId, item.unitId)]).box
  if (item.skill === 'city') return reviewState(places[cityKey(item.cityId)]).box
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
