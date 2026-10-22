import { describe, expect, it } from 'vitest'
import { memoryStorage } from '../../test/memoryStorage'
import { DEFAULT_PINPOINT_CONFIG } from '../modes/pinpoint'
import {
  DEFAULT_PREFERENCES,
  loadPinpointConfig,
  loadPreferences,
  savePinpointConfig,
  savePreferences,
} from './settings'

describe('Pinpoint setup', () => {
  it('upgrades a setup saved before difficulty and variants existed', () => {
    const storage = memoryStorage()
    storage.setItem(
      'world-game:settings:v1',
      JSON.stringify({ region: 'Europe', skipMicro: true, practiceWeak: false }),
    )
    expect(loadPinpointConfig(storage)).toEqual({
      ...DEFAULT_PINPOINT_CONFIG,
      region: 'Europe',
      skipMicro: true,
    })
  })

  it('round-trips and ignores invalid values', () => {
    const storage = memoryStorage()
    const config = { ...DEFAULT_PINPOINT_CONFIG, difficulty: 'hard' as const, night: true }
    savePinpointConfig(config, storage)
    expect(loadPinpointConfig(storage)).toEqual(config)

    storage.setItem('world-game:settings:v1', JSON.stringify({ region: 'Atlantis', difficulty: 9 }))
    expect(loadPinpointConfig(storage)).toEqual(DEFAULT_PINPOINT_CONFIG)
  })
})

describe('preferences', () => {
  it('defaults, round-trips and clamps', () => {
    const storage = memoryStorage()
    expect(loadPreferences(storage)).toEqual(DEFAULT_PREFERENCES)
    savePreferences({ ...DEFAULT_PREFERENCES, units: 'mi', volume: 3 }, storage)
    expect(loadPreferences(storage)).toMatchObject({ units: 'mi', volume: 1 })
  })
})
