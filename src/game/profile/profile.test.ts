import { describe, expect, it } from 'vitest'
import { loadTestGeoData } from '../../test/loadTestCountries'
import { memoryStorage } from '../../test/memoryStorage'
import type { SessionSummary } from '../core/types'
import { dailyNumber, dailyStreak, localDateKey } from './daily'
import { explorerRank, masteryOf } from './mastery'
import { clearProfile, emptyProfile, loadProfile, saveProfile, skillStats } from './profile'
import { weeklyGoals } from './weekly'
import { HISTORY_LIMIT, recordOutcomes, recordSession } from './record'
import type { JsonStorage } from './storage'
import { levelForXp, xpForLevel } from './xp'

const geo = loadTestGeoData()

const summary = (
  score: number,
  endedAt = 1,
  extra: Partial<SessionSummary> = {},
): SessionSummary => ({
  mode: 'pinpoint',
  bestKey: 'pinpoint:countries:World:normal',
  seed: 's',
  startedAt: 0,
  endedAt,
  score,
  maxScore: 10_000,
  outcomes: [],
  metrics: {},
  ...extra,
})

describe('profile storage', () => {
  it('round-trips through storage and clears', () => {
    const storage = memoryStorage()
    const profile = recordOutcomes(
      emptyProfile(),
      [{ countryId: 'PER', skill: 'locate', success: true, distanceKm: 0 }],
      1,
    )
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
    expect(loadProfile(storage).countries).toEqual({
      PER: { locate: { attempts: 3, hits: 2, totalKm: 400, recent: [] } },
    })
    clearProfile(storage)
    expect(loadProfile(storage)).toEqual(emptyProfile())
  })

  it('fills in fields added after a profile was saved', () => {
    const storage = memoryStorage()
    storage.setItem(
      'world-game:profile:v2',
      JSON.stringify({ version: 2, countries: {}, bests: {}, history: [] }),
    )
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
    profile = recordOutcomes(profile, [{ countryId: 'PER', skill: 'locate', success: true }], 1)
    profile = recordOutcomes(
      profile,
      [{ countryId: 'PER', skill: 'locate', success: false, distanceKm: 250 }],
      2,
    )
    expect(skillStats(profile, 'locate')).toEqual({
      PER: { attempts: 2, hits: 1, totalKm: 250, recent: [true, false] },
    })
  })

  it('stamps the moment a country is first mastered', () => {
    let profile = emptyProfile()
    for (let at = 1; at <= 4; at++) {
      profile = recordOutcomes(profile, [{ countryId: 'PER', skill: 'locate', success: true }], at)
    }
    expect(profile.masteredAt).toEqual({ PER: 3 })
  })
})

describe('mastery and ranks', () => {
  const stats = (hits: boolean[]) => ({
    attempts: hits.length,
    hits: hits.filter(Boolean).length,
    totalKm: 0,
    recent: hits.slice(-4),
  })

  it('grows from seen to found to mastered', () => {
    expect(masteryOf(undefined)).toBe('unseen')
    expect(masteryOf({ locate: stats([false]) })).toBe('seen')
    expect(masteryOf({ locate: stats([false, true]) })).toBe('found')
    expect(masteryOf({ locate: stats([true, false, true, true]) })).toBe('mastered')
    // Right in two different skills also counts.
    expect(masteryOf({ locate: stats([true]), name: stats([true]) })).toBe('mastered')
  })

  it('awards titles by countries mastered', () => {
    expect(explorerRank(0)).toEqual({ title: 'Newcomer', next: { title: 'Wanderer', at: 10 } })
    expect(explorerRank(197)).toEqual({ title: 'Atlas', next: null })
  })
})

describe('levels', () => {
  it('needs steadily more XP per level', () => {
    expect([1, 2, 3, 4].map(xpForLevel)).toEqual([0, 200, 600, 1200])
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(599)).toBe(2)
    expect(levelForXp(600)).toBe(3)
  })
})

describe('recordSession', () => {
  it('tracks personal bests per game kind', () => {
    let recorded = recordSession(emptyProfile(), summary(5000), geo)
    expect(recorded).toMatchObject({ previousBest: null, isPersonalBest: true })
    recorded = recordSession(recorded.profile, summary(4000), geo)
    expect(recorded).toMatchObject({ previousBest: 5000, isPersonalBest: false })
    recorded = recordSession(recorded.profile, summary(7000, 9), geo)
    expect(recorded).toMatchObject({ previousBest: 5000, isPersonalBest: true })
    expect(recorded.profile.bests['pinpoint:countries:World:normal']).toEqual({
      score: 7000,
      at: 9,
    })
    expect(recorded.profile.history).toHaveLength(3)
  })

  it('awards XP, first-time achievements and level-ups', () => {
    const first = recordSession(emptyProfile(), summary(10_000), geo)
    expect(first.achievements.map((a) => a.id)).toEqual(
      expect.arrayContaining(['first-steps', 'perfect-ten']),
    )
    expect(first.xpGained).toBe(60 + 140 + 2 * 50)
    expect(first.levelAfter).toBe(2)

    const again = recordSession(first.profile, summary(10_000, 2), geo)
    expect(again.achievements).toEqual([])
  })

  it('completes weekly goals as games are finished, and pays each once', () => {
    // A recent week whose goals include something plain games can complete.
    const week = ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'].find((w) =>
      weeklyGoals(w).some((g) => ['games', 'modes', 'strong'].includes(g.measure.kind)),
    )!
    const [y, m, d] = week.split('-').map(Number)
    const modes = ['pinpoint', 'rush', 'mystery', 'journey', 'rare-earth'] as const
    let profile = emptyProfile()
    const completed: string[] = []
    let xpFromGoals = 0
    for (let i = 0; i < 10; i++) {
      const recorded = recordSession(
        profile,
        summary(9000, new Date(y, m - 1, d + 1, 8 + i).getTime(), {
          mode: modes[i % modes.length],
          bestKey: `${modes[i % modes.length]}:test`,
        }),
        geo,
      )
      completed.push(...recorded.goals.map((g) => g.id))
      xpFromGoals += recorded.goals.reduce((sum, g) => sum + g.xp, 0)
      profile = recorded.profile
    }
    expect(completed.length).toBeGreaterThan(0)
    expect(new Set(completed).size).toBe(completed.length)
    expect(profile.weeklyDone[week]).toEqual(completed)
    expect(xpFromGoals).toBeGreaterThan(0)
  })

  it('reports countries mastered during the game', () => {
    let profile = emptyProfile()
    profile = recordOutcomes(profile, [{ countryId: 'PER', skill: 'locate', success: true }], 1)
    profile = recordOutcomes(profile, [{ countryId: 'PER', skill: 'name', success: true }], 50)
    const recorded = recordSession(profile, summary(1000, 60, { startedAt: 10 }), geo)
    expect(recorded.newlyMastered).toEqual(['PER'])
  })

  it('records the first daily result of the day only', () => {
    const daily = (score: number) =>
      summary(score, 5, {
        mode: 'daily',
        bestKey: 'daily:five',
        maxScore: 5000,
        metrics: { tone0: 4, tone1: 0 },
        daily: { dateKey: '2026-10-21', puzzle: 'five' },
      })
    const first = recordSession(emptyProfile(), daily(3000), geo)
    expect(first.profile.daily['2026-10-21'].five).toEqual({
      score: 3000,
      tones: ['perfect', 'miss'],
    })
    const second = recordSession(first.profile, daily(5000), geo)
    expect(second.profile.daily['2026-10-21'].five?.score).toBe(3000)
  })

  it('caps the history', () => {
    let profile = emptyProfile()
    for (let i = 0; i < HISTORY_LIMIT + 5; i++)
      profile = recordSession(profile, summary(i, i), geo).profile
    expect(profile.history).toHaveLength(HISTORY_LIMIT)
    expect(profile.history.at(-1)?.score).toBe(HISTORY_LIMIT + 4)
  })
})

describe('daily dates and streaks', () => {
  it('numbers puzzles from the epoch', () => {
    expect(dailyNumber('2026-10-01')).toBe(1)
    expect(dailyNumber('2026-10-21')).toBe(21)
    expect(dailyNumber('2027-10-01')).toBe(366)
  })

  it('counts consecutive days, keeping yesterday’s streak alive until today is played', () => {
    const profile = emptyProfile()
    const day = (key: string) => (profile.daily[key] = { five: { score: 1, tones: [] } })
    day('2026-10-18')
    day('2026-10-19')
    day('2026-10-20')
    const today = new Date(2026, 9, 21, 9).getTime()
    expect(localDateKey(today)).toBe('2026-10-21')
    expect(dailyStreak(profile, today)).toBe(3)
    day('2026-10-21')
    expect(dailyStreak(profile, today)).toBe(4)
    expect(dailyStreak(profile, new Date(2026, 9, 23).getTime())).toBe(0)
  })
})
