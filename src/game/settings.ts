import { REGIONS } from '../geo/countries'
import type { GameConfig } from './gameReducer'
import { readJson, writeJson } from './storage'

const SETTINGS_KEY = 'world-game:settings:v1'

export const DEFAULT_CONFIG: GameConfig = { region: 'World', skipMicro: false, practiceWeak: false }

/** The last game setup, so the start screen remembers your choices. */
export function loadLastConfig(): GameConfig {
  const saved = readJson<Partial<GameConfig>>(SETTINGS_KEY, {})
  const validRegion = saved.region === 'World' || REGIONS.some((r) => r === saved.region)
  return {
    region: validRegion && saved.region ? saved.region : DEFAULT_CONFIG.region,
    skipMicro: saved.skipMicro === true,
    practiceWeak: saved.practiceWeak === true,
  }
}

export function saveLastConfig(config: GameConfig): void {
  writeJson(SETTINGS_KEY, config)
}
