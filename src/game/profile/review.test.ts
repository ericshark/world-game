import { describe, expect, it } from 'vitest'
import {
  dueReviews,
  isDue,
  isExpert,
  knowledgeOf,
  nextDueAt,
  reviewState,
  scheduleAfter,
  worldKnowledge,
} from './review'
import { sanitizeCountries } from './sanitize'
import { recordAttempt, type CountryStats } from './stats'

const DAY = 86_400_000
const T0 = 1_000 * DAY

describe('the review schedule', () => {
  it('starts a new skill in box 0, due now', () => {
    expect(reviewState(undefined)).toEqual({ box: 0, dueAt: 0 })
    expect(isDue(undefined, T0)).toBe(true)
  })

  it('moves a first right answer to box 1, due in a day', () => {
    const stats = recordAttempt(undefined, true, 0, T0)
    expect(stats.box).toBe(1)
    expect(stats.dueAt).toBe(T0 + DAY)
  })

  it('does not climb the boxes by repeating a country before it is due', () => {
    let stats = recordAttempt(undefined, true, 0, T0)
    for (let i = 1; i <= 5; i++) stats = recordAttempt(stats, true, 0, T0 + i * 1000)
    expect(stats.box).toBe(1)
    expect(stats.dueAt).toBe(T0 + DAY)
  })

  it('climbs one box per right answer once it is due', () => {
    let stats = recordAttempt(undefined, true, 0, T0)
    stats = recordAttempt(stats, true, 0, T0 + DAY)
    expect(stats.box).toBe(2)
    expect(stats.dueAt).toBe(T0 + DAY + 3 * DAY)
    stats = recordAttempt(stats, true, 0, stats.dueAt!)
    expect(stats.box).toBe(3)
  })

  it('stops at the top box', () => {
    let state = { box: 6, dueAt: 0 }
    state = scheduleAfter({ attempts: 9, hits: 9, totalKm: 0, recent: [], ...state }, true, T0)
    expect(state.box).toBe(6)
  })

  it('drops a wrong answer to box 1, even before it was due', () => {
    let stats = recordAttempt(undefined, true, 0, T0)
    stats = recordAttempt(stats, true, 0, T0 + DAY)
    stats = recordAttempt(stats, false, 0, T0 + DAY + 1000)
    expect(stats.box).toBe(1)
    expect(stats.dueAt).toBe(T0 + DAY + 1000 + DAY)
  })

  it('leaves the schedule alone when no time is given', () => {
    const stats = recordAttempt(undefined, true)
    expect(stats.box).toBeUndefined()
  })
})

describe('older saved stats', () => {
  const old = (hits: number, recent: boolean[]): CountryStats => ({
    attempts: recent.length,
    hits,
    totalKm: 0,
    recent,
  })

  it('are placed from recent answers and count as due, to be checked again', () => {
    expect(reviewState(old(4, [true, true, true, true]))).toEqual({ box: 3, dueAt: 0 })
    expect(reviewState(old(1, [false, false, true]))).toEqual({ box: 1, dueAt: 0 })
    expect(reviewState(old(0, [false, false]))).toEqual({ box: 0, dueAt: 0 })
  })

  it('are kept intact by sanitising, and new fields survive it', () => {
    const kept = sanitizeCountries({
      FRA: { locate: { ...old(2, [true, true]), box: 3, dueAt: T0 } },
      ITA: { locate: { ...old(2, [true, true]), box: 99, dueAt: T0 } },
    })
    expect(kept.FRA?.locate).toMatchObject({ box: 3, dueAt: T0 })
    expect(kept.ITA?.locate?.box).toBeUndefined()
    expect(kept.ITA?.locate?.hits).toBe(2)
  })
})

describe('due reviews', () => {
  const learned = (box: number, dueAt: number): CountryStats => ({
    attempts: 3,
    hits: 3,
    totalKm: 0,
    recent: [true, true, true],
    box,
    dueAt,
  })

  it('lists learned skills that are due, most overdue first, and ignores the unlearned', () => {
    const countries = {
      FRA: { locate: learned(2, T0 - 5 * DAY), name: learned(2, T0 + DAY) },
      ITA: { locate: learned(1, T0 - 1 * DAY), capital: learned(1, T0 - 9 * DAY) },
      DEU: { locate: { attempts: 2, hits: 0, totalKm: 0, recent: [false, false] } },
    }
    expect(dueReviews(countries, T0).map((i) => `${i.countryId}:${i.skill}`)).toEqual([
      'ITA:capital',
      'FRA:locate',
      'ITA:locate',
    ])
    expect(nextDueAt(countries, T0)).toBe(T0 + DAY)
  })
})

describe('the expert tier', () => {
  const held = (box: number): CountryStats => ({
    attempts: 5,
    hits: 5,
    totalKm: 0,
    recent: [true, true, true, true],
    box,
    dueAt: T0,
  })

  it('needs both core skills remembered across weeks', () => {
    expect(isExpert({ locate: held(4), name: held(5) })).toBe(true)
    expect(isExpert({ locate: held(4), name: held(3) })).toBe(false)
    expect(isExpert({ locate: held(6) })).toBe(false)
    expect(isExpert(undefined)).toBe(false)
  })
})

describe('world knowledge', () => {
  const at = (box: number): CountryStats => ({
    attempts: 5,
    hits: 5,
    totalKm: 0,
    recent: [true],
    box,
    dueAt: 0,
  })

  it('rewards remembering over once-only answers', () => {
    expect(knowledgeOf(undefined)).toBe(0)
    expect(knowledgeOf({ locate: at(1), name: at(1) })).toBeCloseTo(0.25)
    expect(knowledgeOf({ locate: at(4), name: at(6) })).toBe(1)
    expect(knowledgeOf({ locate: at(4) })).toBe(0.5)
  })

  it('averages over the countries asked about, counting unseen ones as zero', () => {
    const held = { A: { locate: at(4), name: at(4) } }
    expect(worldKnowledge(held, ['A', 'B'])).toBe(0.5)
    expect(worldKnowledge(held, [])).toBe(0)
  })
})
