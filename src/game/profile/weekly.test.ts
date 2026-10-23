import { describe, expect, it } from 'vitest'
import { loadTestGeoData } from '../../test/loadTestCountries'
import { dailyStreak, localDateKey, streakState } from './daily'
import { emptyProfile, type HistoryEntry, type Profile } from './profile'
import { completeGoals, weekKey, weeklyGoals, weekStatus } from './weekly'

const geo = loadTestGeoData()
const at = (y: number, m: number, d: number, hour = 12) => new Date(y, m - 1, d, hour).getTime()

function withDays(days: string[]): Profile {
  const profile = emptyProfile()
  for (const day of days) profile.daily[day] = { five: { score: 1, tones: [] } }
  return profile
}

/** Dates of `count` days in a row starting at `from` (in October 2026). */
const run = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => `2026-10-${String(from + i).padStart(2, '0')}`)

describe('streak freezes', () => {
  it('earn one for every seventh day in a row', () => {
    const profile = withDays(run(1, 7))
    expect(streakState(profile, at(2026, 10, 8))).toEqual({ streak: 7, freezes: 1 })
    expect(streakState(withDays(run(1, 14)), at(2026, 10, 15))).toEqual({ streak: 14, freezes: 2 })
  })

  it('hold at most two', () => {
    expect(streakState(withDays(run(1, 21)), at(2026, 10, 22)).freezes).toBe(2)
  })

  it('cover a missed day instead of ending the streak', () => {
    // Seven days, a gap on the 8th, then the streak goes on.
    const profile = withDays([...run(1, 7), ...run(9, 3)])
    expect(streakState(profile, at(2026, 10, 12))).toEqual({ streak: 10, freezes: 0 })
  })

  it('run out, and then a miss ends the streak', () => {
    const profile = withDays([...run(1, 7), ...run(10, 2)])
    // The 8th and 9th are missed; one freeze covers only the first.
    expect(streakState(profile, at(2026, 10, 12))).toEqual({ streak: 2, freezes: 0 })
  })

  it('keep yesterday’s streak alive until today is played, as before', () => {
    const profile = withDays(run(1, 5))
    expect(dailyStreak(profile, at(2026, 10, 6))).toBe(5)
    expect(dailyStreak(withDays(run(1, 5)), at(2026, 10, 8))).toBe(0)
  })

  it('ignore junk dates', () => {
    const profile = withDays(run(1, 3))
    profile.daily['not-a-date'] = { five: { score: 1, tones: [] } }
    expect(dailyStreak(profile, at(2026, 10, 4))).toBe(3)
  })
})

describe('weeks', () => {
  it('start on Monday', () => {
    expect(weekKey('2026-10-26')).toBe('2026-10-26')
    expect(weekKey('2026-10-25')).toBe('2026-10-19')
    expect(weekKey('2026-10-23')).toBe('2026-10-19')
    expect(weekKey('2026-11-01')).toBe('2026-10-26')
  })
})

describe('weekly goals', () => {
  it('are three different goals, the same for everyone and different from week to week', () => {
    const goals = weeklyGoals('2026-10-19')
    expect(goals).toHaveLength(3)
    expect(new Set(goals.map((g) => g.measure.kind)).size).toBe(3)
    expect(weeklyGoals('2026-10-19')).toEqual(goals)
    const kinds = (week: string) => weeklyGoals(week).map((g) => g.id)
    const different = ['2026-10-26', '2026-11-02', '2026-11-09'].some(
      (week) => kinds(week).join() !== kinds('2026-10-19').join(),
    )
    expect(different).toBe(true)
    for (const goal of goals) {
      expect(goal.target).toBeGreaterThan(0)
      expect(goal.xp).toBeGreaterThan(0)
    }
  })

  const game = (mode: HistoryEntry['mode'], endedAt: number, score = 100, maxScore = 1000) => ({
    mode,
    bestKey: `${mode}:test`,
    score,
    maxScore,
    endedAt,
  })

  it('count only what happened this week', () => {
    const probe = ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'].find((w) =>
      weeklyGoals(w).some((g) => g.measure.kind === 'games'),
    )!
    const goal = weeklyGoals(probe).find((g) => g.measure.kind === 'games')!
    const [y, m, d] = probe.split('-').map(Number)
    const profile = emptyProfile()
    profile.history = [
      game('pinpoint', new Date(y, m - 1, d - 1, 23).getTime()), // Sunday before: not counted
      game('pinpoint', new Date(y, m - 1, d, 8).getTime()),
      game('rush', new Date(y, m - 1, d + 6, 22).getTime()),
      game('rush', new Date(y, m - 1, d + 7, 1).getTime()), // Monday after: not counted
    ]
    const status = weekStatus(profile, geo, new Date(y, m - 1, d + 2).getTime())
    const entry = status.find((s) => s.goal.id === goal.id)!
    expect(entry.progress).toBe(Math.min(2, goal.target))
  })

  it('pay out once when completed', () => {
    const profile = emptyProfile()
    // Enough varied activity to finish every kind of goal this week could ask for.
    const day = (n: number) => at(2026, 10, 19 + n, 10)
    profile.history = Array.from({ length: 10 }, (_, i) => ({
      mode: (['pinpoint', 'rush', 'mystery', 'journey', 'rare-earth'] as const)[i % 5],
      bestKey: `k${i}`,
      score: 900,
      maxScore: 1000,
      endedAt: day(i % 5),
    }))
    for (let i = 0; i < 5; i++) {
      profile.daily[localDateKey(day(i))] = {
        five: { score: 1, tones: [] },
        mystery: { score: 1, guesses: 3, solved: true },
        route: { score: 1, stars: 3 },
      }
    }
    const ids = geo.playableIds.slice(0, 6)
    profile.masteredAt = Object.fromEntries(ids.map((id) => [id, day(2)]))
    const first = completeGoals(profile, geo, day(4))
    expect(first.completed.length).toBeGreaterThan(0)
    const paid = first.completed.reduce((sum, g) => sum + g.xp, 0)
    expect(first.profile.xp).toBe(paid)
    expect(first.profile.weeklyDone['2026-10-19']).toEqual(first.completed.map((g) => g.id))
    // Doing more does not pay the same goals again.
    const second = completeGoals(first.profile, geo, day(5))
    expect(second.profile.xp).toBe(first.profile.xp)
    expect(second.completed.every((g) => !first.completed.some((f) => f.id === g.id))).toBe(true)
  })

  it('pay nothing for a quiet week', () => {
    const result = completeGoals(emptyProfile(), geo, at(2026, 10, 21))
    expect(result.completed).toEqual([])
    expect(result.profile.xp).toBe(0)
  })
})
