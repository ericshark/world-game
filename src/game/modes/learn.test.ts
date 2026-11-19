import { describe, expect, it } from 'vitest'
import {
  loadTestCities,
  loadTestGeoData,
  loadTestSubdivisionPack,
} from '../../test/loadTestCountries'
import { cityKey } from '../../geo/cities'
import { subPlaceKey } from '../../geo/subdivisions'
import { LOCAL_PLAYER, type Submission } from '../core/types'
import type { CountrySkills } from '../profile/profile'
import {
  buildCityDecks,
  buildCurriculum,
  buildSubLessons,
  cityDeckProgress,
  countryKnown,
  lessonProgress,
  nextLesson,
  subLessonProgress,
  subPackProgress,
} from './curriculum'
import { learn, type LearnConfig, type LearnState } from './learn'
import {
  buildCityDeckQueue,
  buildQueue,
  buildSubLessonQueue,
  confusedPairs,
  examQueue,
  mixupQueue,
  separateRepeats,
  SESSION_SIZE,
  type LearnItem,
} from './learnQueue'
import { masteryOf } from '../profile/mastery'
import { REGIONS } from '../../geo/countries'
import { emptyProfile } from '../profile/profile'
import { recordOutcomes, recordSession } from '../profile/record'
import { countDueReviews, duePlaceReviews, dueSubReviews } from '../profile/review'

const geo = loadTestGeoData()
const cities = loadTestCities()
const deu = loadTestSubdivisionPack('DEU')
const DAY = 86_400_000
const NOW = 500 * DAY

describe('the curriculum', () => {
  const curriculum = buildCurriculum(geo)

  it('teaches every playable country exactly once', () => {
    const all = curriculum.flatMap((lesson) => lesson.ids)
    expect(all).toHaveLength(geo.playableIds.length)
    expect(new Set(all)).toEqual(new Set(geo.playableIds))
  })

  it('has lessons of a handful of countries, inside one region, with unique ids', () => {
    for (const lesson of curriculum) {
      expect(lesson.ids.length).toBeGreaterThanOrEqual(2)
      expect(lesson.ids.length).toBeLessThanOrEqual(8)
      for (const id of lesson.ids) expect(geo.feature(id).properties.region).toBe(lesson.region)
    }
    expect(new Set(curriculum.map((l) => l.id)).size).toBe(curriculum.length)
  })

  it('is the same every time', () => {
    expect(buildCurriculum(geo)).toEqual(curriculum)
  })

  it('tracks progress from stats and finds the next lesson', () => {
    const first = curriculum[0]
    const hit = { attempts: 1, hits: 1, totalKm: 0, recent: [true] }
    const countries: Record<string, CountrySkills> = {}
    expect(nextLesson(countries, curriculum)).toBe(first)
    for (const id of first.ids) countries[id] = { locate: hit, name: hit }
    expect(lessonProgress(countries, first)).toEqual({
      known: first.ids.length,
      total: first.ids.length,
    })
    expect(nextLesson(countries, curriculum)).toBe(curriculum[1])
  })
})

describe('building a session', () => {
  const lesson = buildCurriculum(geo)[0]
  const hit = { attempts: 2, hits: 2, totalKm: 0, recent: [true, true] }

  it('asks a new lesson every skill of every country, with naming assisted', () => {
    const queue = buildQueue({ countries: {}, now: NOW, seed: 's', lesson })
    expect(queue.length).toBe(Math.min(lesson.ids.length * 4, SESSION_SIZE + 5))
    expect(new Set(queue.map((q) => q.countryId))).toEqual(new Set(lesson.ids))
    expect(queue.filter((q) => q.skill === 'name').every((q) => q.assist)).toBe(true)
    expect(queue.filter((q) => q.skill === 'flag').every((q) => q.assist)).toBe(true)
  })

  it('is deterministic for a seed and avoids asking about one country twice in a row', () => {
    const a = buildQueue({ countries: {}, now: NOW, seed: 's', lesson })
    expect(buildQueue({ countries: {}, now: NOW, seed: 's', lesson })).toEqual(a)
    for (let i = 1; i < a.length; i++) expect(a[i].countryId).not.toBe(a[i - 1].countryId)
  })

  it('leaves out skills already learned, and a review asks only what is due', () => {
    const [first, second] = lesson.ids
    const countries: Record<string, CountrySkills> = {
      [first]: {
        locate: { ...hit, box: 2, dueAt: NOW - DAY },
        name: { ...hit, box: 2, dueAt: NOW + 5 * DAY },
      },
      [second]: { locate: { ...hit, box: 1, dueAt: NOW + DAY } },
    }
    const review = buildQueue({ countries, now: NOW, seed: 's' })
    expect(review).toEqual([{ countryId: first, skill: 'locate', assist: false }])

    const taught = buildQueue({ countries, now: NOW, seed: 's', lesson })
    expect(taught.filter((q) => q.countryId === first && q.skill === 'name')).toHaveLength(0)
    expect(taught.filter((q) => q.countryId === second && q.skill === 'locate')).toHaveLength(0)
  })

  it('separates repeats when it can', () => {
    const items: LearnItem[] = ['A', 'A', 'B', 'C'].map((countryId) => ({
      countryId,
      skill: 'locate',
      assist: false,
    }))
    const result = separateRepeats(items)
    for (let i = 1; i < result.length; i++)
      expect(result[i].countryId).not.toBe(result[i - 1].countryId)
  })
})

describe('a learn session', () => {
  const ids = geo.playableIds.slice(0, 3)
  const config: LearnConfig = {
    title: 'Test',
    queue: ids.map((countryId) => ({ countryId, skill: 'name', assist: false })),
  }

  function start(): LearnState {
    return learn.start({ config, seed: 'x', now: 0, geo, players: [LOCAL_PLAYER] })
  }
  const submit = (state: LearnState, submission: Submission) =>
    learn.reduce(state, { type: 'submit', playerId: LOCAL_PLAYER, submission }, geo)
  const next = (state: LearnState, at: number) => learn.reduce(state, { type: 'next', at }, geo)
  const wrong = (state: LearnState) => {
    const target = state.rounds.challenges[state.rounds.round].countryId
    const other = geo.playableIds.find(
      (id) => id !== target && !geo.factsOf(target).neighbors.includes(id),
    )!
    return submit(state, { answerId: other, at: 1 })
  }
  const right = (state: LearnState) =>
    submit(state, { answerId: state.rounds.challenges[state.rounds.round].countryId, at: 1 })

  it('asks a missed question once more at the end, and no more than once', () => {
    let state = wrong(start())
    expect(state.rounds.challenges).toHaveLength(4)
    expect(state.rounds.challenges[3]).toEqual(state.rounds.challenges[0])
    state = next(state, 2)
    state = right(state)
    state = next(state, 3)
    state = right(state)
    state = next(state, 4)
    // The re-asked question, missed again, is not added a third time.
    state = wrong(state)
    expect(state.rounds.challenges).toHaveLength(4)
    state = next(state, 5)
    expect(learn.isFinished(state)).toBe(true)
    expect(state.endedAt).toBe(5)
  })

  it('reports an outcome per answer, including the re-ask, for the review schedule', () => {
    let state = wrong(start())
    const before = state
    state = next(state, 2)
    expect(learn.outcomesBetween(start(), before, LOCAL_PLAYER)).toMatchObject([
      { countryId: ids[0], skill: 'name', success: false, distanceKm: undefined },
    ])
    for (let i = 0; i < 3; i++) {
      state = right(state)
      state = next(state, 3 + i)
    }
    const summary = learn.summarize(state, LOCAL_PLAYER)
    expect(summary.mode).toBe('learn')
    expect(summary.outcomes).toHaveLength(4)
    expect(summary.score).toBe(3000)
    expect(summary.metrics.correct).toBe(3)
    expect(summary.metrics.retried).toBe(1)
  })
})

describe('mix-ups', () => {
  it('collects pairs either way round, most frequent first', () => {
    const pairs = confusedPairs({ 'SVK>SVN': 2, 'SVN>SVK': 1, 'GIN>GNB': 1 })
    expect(pairs).toEqual([
      { a: 'SVK', b: 'SVN', times: 3 },
      { a: 'GIN', b: 'GNB', times: 1 },
    ])
  })

  it('drills both countries of each pair, finding and naming them, deterministically', () => {
    const queue = mixupQueue({ 'SVK>SVN': 2 }, 'seed')
    expect(queue).toHaveLength(4)
    expect(
      queue
        .filter((q) => q.skill === 'locate')
        .map((q) => q.countryId)
        .sort(),
    ).toEqual(['SVK', 'SVN'])
    expect(queue.filter((q) => q.skill === 'name').every((q) => q.assist)).toBe(true)
    expect(mixupQueue({ 'SVK>SVN': 2 }, 'seed')).toEqual(queue)
    expect(mixupQueue({}, 'seed')).toEqual([])
  })

  it('names what a wrong pin or answer was mistaken for', () => {
    const state = learn.start({
      config: { title: 't', queue: [{ countryId: 'FRA', skill: 'name', assist: false }] },
      seed: 'x',
      now: 0,
      geo,
      players: [LOCAL_PLAYER],
    })
    const after = learn.reduce(
      state,
      { type: 'submit', playerId: LOCAL_PLAYER, submission: { answerId: 'ITA', at: 1 } },
      geo,
    )
    expect(learn.outcomesBetween(state, after, LOCAL_PLAYER)[0]).toMatchObject({
      countryId: 'FRA',
      success: false,
      mistakenFor: 'ITA',
    })
  })
})

describe('a regional exam', () => {
  const ids = geo.playableIds
    .filter((id) => geo.feature(id).properties.region === 'Oceania')
    .slice(0, 10)
  const config: LearnConfig = {
    title: 'Oceania exam',
    exam: { region: 'Oceania' },
    queue: examQueue(ids, 'e'),
  }

  function play(misses: number) {
    let state = learn.start({ config, seed: 'x', now: 0, geo, players: [LOCAL_PLAYER] })
    for (let i = 0; i < ids.length; i++) {
      const target = state.rounds.challenges[state.rounds.round].countryId
      const pin = i < misses ? ([0, -89] as [number, number]) : geo.factsOf(target).label
      state = learn.reduce(
        state,
        { type: 'submit', playerId: LOCAL_PLAYER, submission: { pin, at: i } },
        geo,
      )
      state = learn.reduce(state, { type: 'next', at: i }, geo)
    }
    return state
  }

  it('asks every country once, with no re-asks, even after misses', () => {
    expect(new Set(config.queue.map((q) => q.countryId))).toEqual(new Set(ids))
    const state = play(3)
    expect(state.rounds.challenges).toHaveLength(ids.length)
    expect(learn.isFinished(state)).toBe(true)
  })

  it('is passed at 90%: one miss in ten passes, two do not', () => {
    expect(learn.summarize(play(1), LOCAL_PLAYER).metrics).toMatchObject({
      exam: 1,
      examRegion: REGIONS.indexOf('Oceania'),
      examPassed: 1,
    })
    expect(learn.summarize(play(2), LOCAL_PLAYER).metrics.examPassed).toBe(0)
  })

  it('earns a certificate for the region, once', () => {
    const passed = learn.summarize(play(0), LOCAL_PLAYER)
    const first = recordSession(emptyProfile(), passed, geo).profile
    expect(first.certificates).toEqual({ Oceania: passed.endedAt })
    const again = recordSession(first, { ...passed, endedAt: passed.endedAt + 99 }, geo).profile
    expect(again.certificates.Oceania).toBe(passed.endedAt)
    const failed = learn.summarize(play(5), LOCAL_PLAYER)
    expect(recordSession(emptyProfile(), failed, geo).profile.certificates).toEqual({})
  })
})

describe('flags in Learn', () => {
  const ids = geo.playableIds.slice(0, 2)
  const start = (assist: boolean) =>
    learn.start({
      config: {
        title: 'Flags',
        queue: ids.map((countryId) => ({ countryId, skill: 'flag', assist })),
      },
      seed: 'x',
      now: 0,
      geo,
      players: [LOCAL_PLAYER],
    })

  it('picks the flag from look-alikes while it is new, and places it on the globe once known', () => {
    for (const challenge of start(true).rounds.challenges) {
      expect(challenge).toMatchObject({ kind: 'identify', show: 'flag' })
    }
    for (const challenge of start(false).rounds.challenges) {
      expect(challenge).toMatchObject({ kind: 'locate', show: 'flag' })
    }
  })

  it('records the flag skill, and a miss is still asked once more', () => {
    let state = start(true)
    const before = state
    const target = state.rounds.challenges[0].countryId
    const other = geo.playableIds.find((id) => id !== target)!
    state = learn.reduce(
      state,
      { type: 'submit', playerId: LOCAL_PLAYER, submission: { answerId: other, at: 1 } },
      geo,
    )
    expect(learn.outcomesBetween(before, state, LOCAL_PLAYER)).toEqual([
      expect.objectContaining({ skill: 'flag', success: false }),
    ])
    expect(state.rounds.challenges).toHaveLength(3)
  })

  it('does not change what finding and naming mean for knowing a country', () => {
    const flagOnly = { flag: { attempts: 5, hits: 5, totalKm: 0, recent: [true, true, true] } }
    expect(countryKnown(flagOnly)).toBe(false)
    expect(masteryOf(flagOnly)).toBe('unseen')
  })
})

describe('major cities in Learn', () => {
  const decks = buildCityDecks(geo, cities)

  it('builds regional decks covering every major city exactly once', () => {
    const allIds = decks.flatMap((d) => d.cityIds)
    expect(allIds).toHaveLength(cities.all.length)
    expect(new Set(allIds)).toEqual(new Set(cities.all.map((c) => c.id)))
    expect(new Set(decks.map((d) => d.id)).size).toBe(decks.length)
    for (const deck of decks) {
      expect(deck.id).toMatch(/^cities-/)
      for (const id of deck.cityIds) {
        expect(geo.feature(cities.get(id)!.countryId).properties.region).toBe(deck.region)
      }
    }
  })

  it('plays a city deck, re-asks misses once, updates places only, and schedules city reviews', () => {
    const oceania = decks.find((d) => d.region === 'Oceania')!
    const queue = buildCityDeckQueue(oceania, cities, {}, 'seed-city')
    expect(queue).toHaveLength(oceania.cityIds.length)

    let state = learn.start({
      config: { title: oceania.title, queue },
      seed: 'seed-city',
      now: NOW,
      geo,
      cities,
      players: [LOCAL_PLAYER],
    })
    let profile = emptyProfile()

    // Miss the first city; hit every other round including the re-ask.
    let missedOnce = false
    while (!learn.isFinished(state)) {
      const challenge = state.rounds.challenges[state.rounds.round]
      expect(challenge.kind).toBe('city')
      if (challenge.kind === 'city') {
        const pin: [number, number] = !missedOnce ? [0, -89] : challenge.at
        missedOnce = true
        const before = state
        state = learn.reduce(
          state,
          { type: 'submit', playerId: LOCAL_PLAYER, submission: { pin, at: NOW } },
          geo,
        )
        profile = recordOutcomes(profile, learn.outcomesBetween(before, state, LOCAL_PLAYER), NOW)
        state = learn.reduce(state, { type: 'next', at: NOW + 10 }, geo)
      }
    }

    // One re-ask added.
    expect(state.rounds.challenges).toHaveLength(oceania.cityIds.length + 1)
    expect(Object.keys(profile.countries)).toHaveLength(0)
    expect(Object.keys(profile.masteredAt)).toHaveLength(0)
    expect(Object.keys(profile.places)).toHaveLength(oceania.cityIds.length)
    expect(cityDeckProgress(profile.places, oceania)).toEqual({
      known: oceania.cityIds.length,
      total: oceania.cityIds.length,
    })

    // Completed decks remain replayable (asks the whole deck again).
    expect(buildCityDeckQueue(oceania, cities, profile.places, 's2')).toHaveLength(
      oceania.cityIds.length,
    )

    // Due city reviews show up alongside due country reviews.
    const dueLater = duePlaceReviews(profile.places, NOW + 2 * DAY)
    expect(dueLater).toHaveLength(oceania.cityIds.length)
    const review = buildQueue({
      countries: {},
      places: profile.places,
      cities,
      now: NOW + 2 * DAY,
      seed: 'rev',
    })
    expect(review.length).toBeGreaterThan(0)
    expect(review.every((item) => item.skill === 'city')).toBe(true)
    expect(profile.places[cityKey(oceania.cityIds[0])]?.attempts).toBeGreaterThanOrEqual(1)
  })
})

describe('states & provinces in Learn', () => {
  const lessons = buildSubLessons(deu)

  it('builds per-pack lessons covering every state or province once', () => {
    const allIds = lessons.flatMap((l) => l.unitIds)
    expect(allIds).toHaveLength(deu.playableIds.length)
    expect(new Set(allIds)).toEqual(new Set(deu.playableIds))
    for (const lesson of lessons) {
      expect(lesson.id).toMatch(/^sub-deu-\d+$/)
      expect(lesson.packId).toBe('DEU')
    }
  })

  it('plays a state lesson, tracks per-pack progress, and includes due states in reviews', () => {
    const first = lessons[0]
    const queue = buildSubLessonQueue(first, {}, 'seed-sub')
    expect(queue).toHaveLength(first.unitIds.length * 2)

    let state = learn.start({
      config: { title: first.title, queue },
      seed: 'seed-sub',
      now: NOW,
      geo,
      subdivisions: { DEU: deu },
      players: [LOCAL_PLAYER],
    })
    let profile = emptyProfile()

    while (!learn.isFinished(state)) {
      const challenge = state.rounds.challenges[state.rounds.round]
      const before = state
      const submission: Submission =
        challenge.kind === 'locate'
          ? { pin: deu.factsOf(challenge.countryId).label, at: NOW }
          : { answerId: challenge.countryId, at: NOW }
      state = learn.reduce(state, { type: 'submit', playerId: LOCAL_PLAYER, submission }, geo, {
        DEU: deu,
      })
      profile = recordOutcomes(profile, learn.outcomesBetween(before, state, LOCAL_PLAYER), NOW)
      state = learn.reduce(state, { type: 'next', at: NOW + 10 }, geo, { DEU: deu })
    }

    expect(Object.keys(profile.countries)).toHaveLength(0)
    expect(subLessonProgress(profile.places, first)).toEqual({
      known: first.unitIds.length,
      total: first.unitIds.length,
    })
    expect(subPackProgress(profile.places, 'DEU', deu.playableIds)).toEqual({
      known: first.unitIds.length,
      total: deu.playableIds.length,
    })
    expect(profile.places[subPlaceKey('DEU', first.unitIds[0])]?.hits).toBeGreaterThanOrEqual(1)

    // Two days later, the learned states become due for review.
    expect(dueSubReviews(profile.places, NOW + 2 * DAY)).toHaveLength(first.unitIds.length)
    expect(countDueReviews(profile, NOW + 2 * DAY)).toBe(first.unitIds.length)
    const review = buildQueue({
      countries: {},
      places: profile.places,
      subdivisions: { DEU: deu },
      now: NOW + 2 * DAY,
      seed: 'rev-sub',
    })
    expect(review).toHaveLength(first.unitIds.length)
    expect(review.every((item) => 'packId' in item && item.packId === 'DEU')).toBe(true)
  })
})
