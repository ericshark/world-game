import { DEFAULT_RARE_EARTH_CONFIG, type RareEarthConfig } from '../../game/modes/rareEarth'
import { loadSetup } from '../../game/profile/settings'

export function loadRareEarthConfig(): RareEarthConfig {
  return loadSetup<RareEarthConfig>('rare-earth', (saved) => ({
    difficulty: saved.difficulty === 'hard' ? 'hard' : DEFAULT_RARE_EARTH_CONFIG.difficulty,
  }))
}
