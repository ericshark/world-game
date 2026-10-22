import { DEFAULT_RARE_EARTH_CONFIG, type RareEarthConfig } from '../../game/modes/rareEarth'
import { loadSetup } from '../../game/profile/settings'

export function loadRareEarthConfig(): RareEarthConfig {
  return loadSetup<RareEarthConfig>('rare-earth', sanitizeRareEarthConfig)
}

/** A valid setup from saved or shared values, with defaults for anything invalid. */
export function sanitizeRareEarthConfig(saved: Partial<RareEarthConfig>): RareEarthConfig {
  return {
    difficulty: saved.difficulty === 'hard' ? 'hard' : DEFAULT_RARE_EARTH_CONFIG.difficulty,
  }
}
