import { describe, expect, it } from 'vitest'
import { loadTestGeoData } from '../../test/loadTestCountries'
import { LOCAL_PLAYER, type Submission } from '../core/types'
import type { CountrySkills } from '../profile/profile'
import { buildCurriculum, lessonProgress, nextLesson } from './curriculum'
import { learn, type LearnConfig, type LearnState } from './learn'
import {
  buildQueue,
  confusedPairs,
  examQueue,
  mixupQueue,
  separateRepeats,
  SESSION_SIZE,
  type LearnItem,
} from './learnQueue'
import { REGIONS } from '../../geo/countries'
import { emptyProfile } from '../profile/profile'
import { recordSession } from '../profile/record'

const geo = loadTestGeoData()
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
    expect(queue.length).toBe(Math.min(lesson.ids.length * 3, SESSION_SIZE + 5))
    expect(new Set(queue.map((q) => q.countryId))).toEqual(new Set(lesson.ids))
    expect(queue.filter((q) => q.skill === 'name').every((q) => q.assist)).toBe(true)
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
