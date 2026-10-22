import { DEFAULT_RUSH_CONFIG, type RushConfig } from '../../game/modes/rush'
import { loadSetup, sanitizeRegion } from '../../game/profile/settings'

export function loadRushConfig(): RushConfig {
  return loadSetup<RushConfig>('rush', sanitizeRushConfig)
}

/** A valid setup from saved or shared values, with defaults for anything invalid. */
export function sanitizeRushConfig(saved: Partial<RushConfig>): RushConfig {
  return {
    region: sanitizeRegion(saved.region, DEFAULT_RUSH_CONFIG.region),
    suddenDeath: saved.suddenDeath === true,
  }
}
