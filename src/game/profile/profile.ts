import type { ModeId, Skill } from '../core/types'
import type { CountryStats, StatsByCountry } from './stats'
import { readJson, removeKey, writeJson, type JsonStorage } from './storage'

const PROFILE_KEY = 'world-game:profile:v2'
/** Per-country "find it" stats from before modes existed; migrated on first load. */
const LEGACY_STATS_KEY = 'world-game:stats:v1'

export interface PersonalBest {
  score: number
  at: number
}

export interface HistoryEntry {
  mode: ModeId
  bestKey: string
  score: number
  maxScore: number | null
  endedAt: number
}

/** Everything the player has achieved, kept in this browser only. */
export interface Profile {
  version: 2
  countries: Record<string, Partial<Record<Skill, CountryStats>>>
  bests: Record<string, PersonalBest>
  /** Finished games, oldest first, capped in length. */
  history: HistoryEntry[]
}

export function emptyProfile(): Profile {
  return { version: 2, countries: {}, bests: {}, history: [] }
}

export function loadProfile(storage?: JsonStorage): Profile {
  const saved = readJson<Partial<Profile> | null>(PROFILE_KEY, null, storage)
  if (isObject(saved) && saved.version === 2) {
    return {
      version: 2,
      countries: isObject(saved.countries) ? saved.countries : {},
      bests: isObject(saved.bests) ? saved.bests : {},
      history: Array.isArray(saved.history) ? saved.history : [],
    }
  }
  return migrateLegacyStats(readJson<unknown>(LEGACY_STATS_KEY, null, storage))
}

export function saveProfile(profile: Profile, storage?: JsonStorage): void {
  writeJson(PROFILE_KEY, profile, storage)
}

/** Deletes all progress, including pre-migration stats so they cannot come back. */
export function clearProfile(storage?: JsonStorage): void {
  removeKey(PROFILE_KEY, storage)
  removeKey(LEGACY_STATS_KEY, storage)
}

/** One skill's stats for every country that has any. */
export function skillStats(profile: Profile, skill: Skill): StatsByCountry {
  const result: StatsByCountry = {}
  for (const [id, skills] of Object.entries(profile.countries)) {
    const stats = skills[skill]
    if (stats) result[id] = stats
  }
  return result
}

function migrateLegacyStats(legacy: unknown): Profile {
  const profile = emptyProfile()
  if (!isObject(legacy)) return profile
  for (const [id, value] of Object.entries(legacy)) {
    if (!isObject(value)) continue
    const { attempts, hits, totalKm } = value as Record<string, unknown>
    if (typeof attempts !== 'number' || typeof hits !== 'number') continue
    profile.countries[id] = {
      locate: { attempts, hits, totalKm: typeof totalKm === 'number' ? totalKm : 0, recent: [] },
    }
  }
  return profile
}

function isObject(value: unknown): value is Record<string, never> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
