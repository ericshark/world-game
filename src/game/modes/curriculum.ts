import { cityKey, type CityIndex } from '../../geo/cities'
import { REGIONS, type Region } from '../../geo/countries'
import type { GeoData } from '../../geo/facts'
import { LEARN_SKILLS, isLearned } from '../profile/review'
import type { CountrySkills } from '../profile/profile'
import type { CountryStats } from '../profile/stats'

/** Countries per lesson, give or take one. */
const LESSON_SIZE = 5
/** Major cities per regional deck, give or take a couple. */
const CITY_DECK_SIZE = 10

export interface Lesson {
  id: string
  title: string
  region: Region
  subregion: string
  /** In teaching order: well-known countries first, neighbours kept together. */
  ids: string[]
}

/**
 * The course, generated from the data: each region splits into its UN subregions, and each
 * subregion into lessons of about five countries. Nothing is stored, so the lessons follow the
 * data when it changes.
 */
export function buildCurriculum(geo: GeoData): Lesson[] {
  const lessons: Lesson[] = []
  for (const region of REGIONS) {
    const bySubregion = new Map<string, string[]>()
    for (const id of geo.playableIds) {
      if (geo.feature(id).properties.region !== region) continue
      const subregion = geo.factsOf(id).subregion || region
      bySubregion.set(subregion, [...(bySubregion.get(subregion) ?? []), id])
    }
    const groups = [...bySubregion].map(([subregion, ids]) => ({
      subregion,
      ids: teachingOrder(ids, geo),
      hardness: ids.reduce((sum, id) => sum + geo.difficulty(id), 0) / ids.length,
    }))
    groups.sort((a, b) => a.hardness - b.hardness || a.subregion.localeCompare(b.subregion))
    for (const { subregion, ids } of groups) {
      const count = Math.max(1, Math.round(ids.length / LESSON_SIZE))
      let start = 0
      for (let i = 0; i < count; i++) {
        const end = start + Math.ceil((ids.length - start) / (count - i))
        lessons.push({
          id: `${slug(subregion)}-${i + 1}`,
          title: count === 1 ? subregion : `${subregion} · ${i + 1} of ${count}`,
          region,
          subregion,
          ids: ids.slice(start, end),
        })
        start = end
      }
    }
  }
  return lessons
}

/** Easiest first, then always a neighbour of what was just taught when one is left. */
function teachingOrder(ids: string[], geo: GeoData): string[] {
  const left = new Set(ids)
  const easiest = () =>
    [...left].sort((a, b) => geo.difficulty(a) - geo.difficulty(b) || a.localeCompare(b))[0]
  const order: string[] = []
  let current = easiest()
  while (left.size > 0) {
    left.delete(current)
    order.push(current)
    if (left.size === 0) break
    const neighbours = geo
      .factsOf(current)
      .neighbors.filter((id) => left.has(id))
      .sort((a, b) => geo.difficulty(a) - geo.difficulty(b) || a.localeCompare(b))
    current = neighbours[0] ?? easiest()
  }
  return order
}

/** The route target that opens a region's exam. */
export function examTarget(region: Region): string {
  return `exam-${slug(region)}`
}

export function regionOfExam(target: string): Region | null {
  return REGIONS.find((region) => examTarget(region) === target) ?? null
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export interface LessonProgress {
  known: number
  total: number
}

/** A country is known once it has been found and named correctly at least once. */
export function countryKnown(held: CountrySkills | undefined): boolean {
  return isLearned(held?.locate) && isLearned(held?.name)
}

/** Derived from the saved stats, so there is nothing extra to store or migrate. */
export function lessonProgress(
  countries: Record<string, CountrySkills>,
  lesson: Lesson,
): LessonProgress {
  return {
    known: lesson.ids.filter((id) => countryKnown(countries[id])).length,
    total: lesson.ids.length,
  }
}

/** The first lesson with something left to learn, or null when the whole course is known. */
export function nextLesson(
  countries: Record<string, CountrySkills>,
  curriculum: Lesson[],
): Lesson | null {
  return (
    curriculum.find((lesson) => {
      const { known, total } = lessonProgress(countries, lesson)
      return known < total
    }) ?? null
  )
}

export interface CityDeck {
  id: string
  title: string
  region: Region
  /** In teaching order: most famous cities first. */
  cityIds: string[]
}

/** Regional major-city decks, generated from `cities.json` so they follow the data. */
export function buildCityDecks(geo: GeoData, cities: CityIndex): CityDeck[] {
  const decks: CityDeck[] = []
  for (const region of REGIONS) {
    const list = [...cities.inRegion(geo, region)].sort(
      (a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id),
    )
    if (list.length === 0) continue
    const count = Math.max(1, Math.round(list.length / CITY_DECK_SIZE))
    let start = 0
    for (let i = 0; i < count; i++) {
      const end = start + Math.ceil((list.length - start) / (count - i))
      decks.push({
        id: `cities-${slug(region)}-${i + 1}`,
        title: count === 1 ? region : `${region} · ${i + 1} of ${count}`,
        region,
        cityIds: list.slice(start, end).map((c) => c.id),
      })
      start = end
    }
  }
  return decks
}

export function cityDeckProgress(
  places: Record<string, CountryStats>,
  deck: CityDeck,
): LessonProgress {
  return {
    known: deck.cityIds.filter((id) => isLearned(places[cityKey(id)])).length,
    total: deck.cityIds.length,
  }
}

export { LEARN_SKILLS }
