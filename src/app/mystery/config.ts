import { DEFAULT_MYSTERY_CONFIG, type MysteryConfig } from '../../game/modes/mystery'
import { loadSetup } from '../../game/profile/settings'

export function loadMysteryConfig(): MysteryConfig {
  return loadSetup<MysteryConfig>('mystery', (saved) => ({
    difficulty: saved.difficulty === 'hard' ? 'hard' : DEFAULT_MYSTERY_CONFIG.difficulty,
  }))
}
