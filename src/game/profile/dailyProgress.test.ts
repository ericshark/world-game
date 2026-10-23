import { describe, expect, it } from 'vitest'
import { memoryStorage } from '../../test/memoryStorage'
import { loadDailyProgress, saveDailyProgress } from './dailyProgress'

describe('daily progress', () => {
  it('resumes an unfinished puzzle saved today for the same seed', () => {
    const storage = memoryStorage()
    saveDailyProgress('2026-10-21', 'five', { seed: 'a', round: 2 } as { seed: string }, storage)
    expect(loadDailyProgress('2026-10-21', 'five', 'a', storage)).toEqual({ seed: 'a', round: 2 })
    expect(loadDailyProgress('2026-10-21', 'mystery', 'a', storage)).toBeNull()
    // A changed generator gives a new seed; an old save must not be forced onto it.
    expect(loadDailyProgress('2026-10-21', 'five', 'b', storage)).toBeNull()
  })

  it('keeps each puzzle separately and forgets earlier days', () => {
    const storage = memoryStorage()
    saveDailyProgress('2026-10-21', 'five', { seed: 'a' }, storage)
    saveDailyProgress('2026-10-21', 'route', { seed: 'r' }, storage)
    expect(loadDailyProgress('2026-10-21', 'five', 'a', storage)).not.toBeNull()

    saveDailyProgress('2026-10-22', 'mystery', { seed: 'm' }, storage)
    expect(loadDailyProgress('2026-10-21', 'route', 'r', storage)).toBeNull()
    expect(loadDailyProgress('2026-10-22', 'mystery', 'm', storage)).toEqual({ seed: 'm' })
  })
})
