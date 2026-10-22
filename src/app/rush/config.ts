import { DEFAULT_RUSH_CONFIG, type RushConfig } from '../../game/modes/rush'
import { loadSetup, sanitizeRegion } from '../../game/profile/settings'

export function loadRushConfig(): RushConfig {
  return loadSetup<RushConfig>('rush', (saved) => ({
    region: sanitizeRegion(saved.region, DEFAULT_RUSH_CONFIG.region),
    suddenDeath: saved.suddenDeath === true,
  }))
}
