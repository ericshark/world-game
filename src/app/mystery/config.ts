import { DEFAULT_MYSTERY_CONFIG, type MysteryConfig } from '../../game/modes/mystery'
import { loadSetup } from '../../game/profile/settings'

export function loadMysteryConfig(): MysteryConfig {
  return loadSetup<MysteryConfig>('mystery', sanitizeMysteryConfig)
}

/** A valid setup from saved or shared values, with defaults for anything invalid. */
export function sanitizeMysteryConfig(saved: Partial<MysteryConfig>): MysteryConfig {
  return {
    difficulty: saved.difficulty === 'hard' ? 'hard' : DEFAULT_MYSTERY_CONFIG.difficulty,
  }
}
