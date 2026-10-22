import { describe, expect, it } from 'vitest'
import { memoryStorage } from '../../test/memoryStorage'
import type { SessionSummary } from '../core/types'
import { clearProfile, emptyProfile, loadProfile, saveProfile, skillStats } from './profile'
import { HISTORY_LIMIT, recordOutcomes, recordSession } from './record'
import type { JsonStorage } from './storage'

const summary = (score: number, endedAt = 1): SessionSummary => ({
  mode: 'pinpoint',
  bestKey: 'pinpoint:World',
  seed: 's',
  startedAt: 0,
  endedAt,
  score,
  maxScore: 10_000,
  outcomes: [],
})

describe('profile storage', () => {
  it('round-trips through storage and clears', () => {
    const storage = memoryStorage()
    const profile = recordOutcomes(emptyProfile(), [
      { countryId: 'PER', skill: 'locate', success: true, distanceKm: 0 },
    ])
    saveProfile(profile, storage)
    expect(loadProfile(storage)).toEqual(profile)
    clearProfile(storage)
    expect(loadProfile(storage)).toEqual(emptyProfile())
  })

  it('migrates stats saved before profiles existed', () => {
    const storage = memoryStorage()
    storage.setItem(
      'world-game:stats:v1',
      JSON.stringify({ PER: { attempts: 3, hits: 2, totalKm: 400 }, BAD: 'nonsense' }),
    )
    const profile = loadProfile(storage)
    expect(profile.countries).toEqual({
      PER: { locate: { attempts: 3, hits: 2, totalKm: 400, recent: [] } },
    })

    // Clearing removes the old stats too, so they are not migrated again.
    clearProfile(storage)
    expect(loadProfile(storage)).toEqual(emptyProfile())
  })

  it('keeps working when storage throws or holds garbage', () => {
    const broken: JsonStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadProfile(broken)).toEqual(emptyProfile())
    expect(() => saveProfile(emptyProfile(), broken)).not.toThrow()
    expect(() => clearProfile(broken)).not.toThrow()

    const garbage = memoryStorage()
    garbage.setItem('world-game:profile:v2', '{not json')
    expect(loadProfile(garbage)).toEqual(emptyProfile())
  })
})

describe('recordOutcomes', () => {
  it('accumulates attempts, hits, distance and recent results per skill', () => {
    let profile = emptyProfile()
    profile = recordOutcomes(profile, [{ countryId: 'PER', skill: 'locate', success: true }])
    profile = recordOutcomes(profile, [
      { countryId: 'PER', skill: 'locate', success: false, distanceKm: 250 },
    ])
    expect(skillStats(profile, 'locate')).toEqual({
      PER: { attempts: 2, hits: 1, totalKm: 250, recent: [true, false] },
    })
  })

  it('remembers only the last few outcomes', () => {
    let profile = emptyProfile()
    for (const success of [false, false, true, true, true, true]) {
      profile = recordOutcomes(profile, [{ countryId: 'PER', skill: 'locate', success }])
    }
    expect(profile.countries.PER.locate?.recent).toEqual([true, true, true, true])
  })
})

describe('recordSession', () => {
  it('tracks personal bests per game kind', () => {
    let recorded = recordSession(emptyProfile(), summary(5000))
    expect(recorded).toMatchObject({ previousBest: null, isPersonalBest: true })

    recorded = recordSession(recorded.profile, summary(4000))
    expect(recorded).toMatchObject({ previousBest: 5000, isPersonalBest: false })

    recorded = recordSession(recorded.profile, summary(7000, 9))
    expect(recorded).toMatchObject({ previousBest: 5000, isPersonalBest: true })
    expect(recorded.profile.bests['pinpoint:World']).toEqual({ score: 7000, at: 9 })
    expect(recorded.profile.history).toHaveLength(3)
  })

  it('caps the history', () => {
    let profile = emptyProfile()
    for (let i = 0; i < HISTORY_LIMIT + 5; i++)
      profile = recordSession(profile, summary(i, i)).profile
    expect(profile.history).toHaveLength(HISTORY_LIMIT)
    expect(profile.history.at(-1)?.score).toBe(HISTORY_LIMIT + 4)
  })
})
