import { describe, expect, it } from 'vitest'
import { createBackup, readBackup } from './backup'
import { emptyProfile, loadProfile, saveProfile, type Profile } from './profile'
import { MAX_PLACES, MAX_PROFILE_BYTES } from './sanitize'
import { memoryStorage } from './storage'
import { DEFAULT_PREFERENCES } from './settings'

function load(saved: unknown): Profile {
  const storage = memoryStorage()
  saveProfile(saved as Profile, storage)
  return loadProfile(storage)
}

const goodStats = { attempts: 4, hits: 3, totalKm: 120, recent: [true, false, true] }

describe('loading a damaged profile', () => {
  it('keeps sound entries and drops broken ones', () => {
    const profile = load({
      version: 2,
      countries: {
        FRA: { locate: goodStats, capital: { attempts: 'lots' }, bogus: goodStats },
        'not a country!': { locate: goodStats },
        DEU: 'nonsense',
        ESP: { locate: { attempts: 1, hits: 5, totalKm: 0, recent: [] } },
      },
      bests: {
        'pinpoint:World': { score: 900, at: 1_700_000_000_000 },
        broken: { score: 'high' },
        '': { score: 1, at: 1 },
      },
      history: [
        { mode: 'pinpoint', bestKey: 'pinpoint:World', score: 500, maxScore: 1000, endedAt: 5 },
        { mode: 'not-a-mode', bestKey: 'x', score: 1, maxScore: null, endedAt: 1 },
        { mode: 'rush', bestKey: 'rush', score: -4, maxScore: null, endedAt: 1 },
        null,
        {
          mode: 'rush',
          bestKey: 'rush',
          score: 7,
          maxScore: null,
          endedAt: 9,
          metrics: { found: 7, evil: 'x' },
        },
      ],
      xp: 1234.9,
      achievements: { 'first-steps': 5, junk: 'never', '': 3 },
      masteredAt: { FRA: 10, DEU: NaN },
      daily: {
        '2026-10-21': {
          five: { score: 4000, tones: ['perfect', 'good', 7] },
          mystery: { score: 'x' },
          route: { score: 800, stars: 9 },
        },
        yesterday: { five: { score: 1, tones: [] } },
      },
      cosmetics: { pin: 'gold', shape: 42, trail: 'x'.repeat(100) },
    })

    expect(profile.countries).toEqual({ FRA: { locate: goodStats } })
    expect(profile.bests).toEqual({ 'pinpoint:World': { score: 900, at: 1_700_000_000_000 } })
    expect(profile.history.map((h) => h.score)).toEqual([500, 7])
    expect(profile.history[1].metrics).toEqual({ found: 7 })
    expect(profile.xp).toBe(1234)
    expect(profile.achievements).toEqual({ 'first-steps': 5 })
    expect(profile.masteredAt).toEqual({ FRA: 10 })
    expect(profile.daily).toEqual({
      '2026-10-21': { five: { score: 4000, tones: ['perfect', 'good'] } },
    })
    expect(profile.cosmetics).toMatchObject({ pin: 'gold', shape: 'classic', trail: 'solid' })
  })

  it('leaves a healthy profile exactly as it was', () => {
    const healthy: Profile = {
      ...emptyProfile(),
      xp: 900,
      countries: { FRA: { locate: goodStats } },
      bests: { 'rush:World': { score: 12, at: 3 } },
      history: [{ mode: 'daily', bestKey: 'daily:five', score: 3000, maxScore: 5000, endedAt: 7 }],
      achievements: { a: 1 },
      masteredAt: { FRA: 2 },
      daily: { '2026-10-21': { route: { score: 700, stars: 2 } } },
    }
    expect(load(healthy)).toEqual(healthy)
  })

  it('caps the history', () => {
    const entry = { mode: 'pinpoint', bestKey: 'k', score: 1, maxScore: 10, endedAt: 1 }
    expect(load({ version: 2, history: Array(1000).fill(entry) }).history).toHaveLength(300)
  })

  it('sanitizes and caps places entries while preserving valid city stats', () => {
    const many = Object.fromEntries(
      Array.from({ length: MAX_PLACES + 50 }, (_, i) => [
        `city:c-${i}`,
        { ...goodStats, box: 1, dueAt: i + 1 },
      ]),
    )
    const profile = load({
      version: 2,
      places: {
        ...many,
        'BAD KEY': goodStats,
        'city:broken': { attempts: 1, hits: 5 },
      },
    })
    expect(Object.keys(profile.places)).toHaveLength(MAX_PLACES)
    expect(profile.places['BAD KEY']).toBeUndefined()
    expect(profile.places['city:broken']).toBeUndefined()
    expect(profile.places[`city:c-${MAX_PLACES + 49}`]).toEqual({
      ...goodStats,
      box: 1,
      dueAt: MAX_PLACES + 50,
    })
  })
})

describe('importing a backup', () => {
  it('refuses a file that is too large to be real', () => {
    const profile = { ...emptyProfile(), xp: 5 }
    const huge = createBackup(profile, DEFAULT_PREFERENCES).replace(
      '"preferences"',
      `"padding": "${'x'.repeat(MAX_PROFILE_BYTES)}", "preferences"`,
    )
    expect(readBackup(huge)).toBeNull()
  })
})
