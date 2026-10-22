import { describe, expect, it } from 'vitest'
import { createBackup, readBackup } from './backup'
import { emptyProfile } from './profile'
import { DEFAULT_PREFERENCES } from './settings'

describe('backups', () => {
  it('round-trip progress and settings', () => {
    const profile = { ...emptyProfile(), xp: 1234, achievements: { 'first-steps': 5 } }
    const preferences = { ...DEFAULT_PREFERENCES, units: 'mi' as const }
    expect(readBackup(createBackup(profile, preferences))).toEqual({ profile, preferences })
  })

  it('refuses files that are not backups', () => {
    expect(readBackup('{oops')).toBeNull()
    expect(readBackup(JSON.stringify({ hello: 'world' }))).toBeNull()
  })

  it('repairs damaged parts instead of trusting them', () => {
    const restored = readBackup(
      JSON.stringify({
        format: 'world-game-backup',
        profile: { version: 2, xp: -5 },
        preferences: { units: 'parsecs' },
      }),
    )
    expect(restored?.profile.xp).toBe(0)
    expect(restored?.preferences.units).toBe('km')
  })
})
