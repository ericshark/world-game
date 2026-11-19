import { cityIdFromKey } from '../../geo/cities'
import { parseSubPlaceKey, type SubPackId } from '../../geo/subdivisions'
import type { ModeId, Skill } from '../core/types'
import type { CountryStats, StatsByCountry } from './stats'
import {
  isObject,
  sanitizeBests,
  sanitizeCosmeticPicks,
  sanitizeCountries,
  sanitizeDaily,
  sanitizeHistory,
  sanitizePlaces,
  sanitizeTimes,
  sanitizeCertificates,
  sanitizeConfusions,
  sanitizeWeeklyDone,
  sanitizeXp,
} from './sanitize'
import { memoryStorage, readJson, removeKey, writeJson, type JsonStorage } from './storage'

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
  metrics?: Record<string, number>
}

/** One day's daily puzzles, keyed by local date (YYYY-MM-DD) in the profile. */
export interface DailyRecord {
  five?: { score: number; tones: string[] }
  mystery?: { score: number; guesses: number; solved: boolean }
  route?: { score: number; stars: number }
}

/** Looks the player has picked from what they have unlocked. */
export interface Cosmetics {
  pin: string
  shape: string
  trail: string
  glow: string
  title: string
}

export type CountrySkills = Partial<Record<Skill, CountryStats>>

/** Everything the player has achieved, kept in this browser only. */
export interface Profile {
  version: 2
  countries: Record<string, CountrySkills>
  /** Stats for non-country places (`city:<id>`, etc.), kept separate from country stats. */
  places: Record<string, CountryStats>
  bests: Record<string, PersonalBest>
  /** Finished games, oldest first, capped in length. */
  history: HistoryEntry[]
  xp: number
  /** Achievement id → when it was unlocked. */
  achievements: Record<string, number>
  /** Country id → when it was first mastered. */
  masteredAt: Record<string, number>
  daily: Record<string, DailyRecord>
  /** Week (its Monday's date) → ids of the weekly goals already completed and paid out. */
  weeklyDone: Record<string, string[]>
  /** `target>picked` → how often the player took one country for the other (capped). */
  confusions: Record<string, number>
  /** Region → when its exam was first passed. */
  certificates: Record<string, number>
  cosmetics: Cosmetics
}

export const DEFAULT_COSMETICS: Cosmetics = {
  pin: 'coral',
  shape: 'classic',
  trail: 'solid',
  glow: 'classic',
  title: 'none',
}

export function emptyProfile(): Profile {
  return {
    version: 2,
    countries: {},
    places: {},
    bests: {},
    history: [],
    xp: 0,
    achievements: {},
    masteredAt: {},
    daily: {},
    weeklyDone: {},
    confusions: {},
    certificates: {},
    cosmetics: DEFAULT_COSMETICS,
  }
}

export function loadProfile(storage?: JsonStorage): Profile {
  const saved = readJson<Partial<Profile> | null>(PROFILE_KEY, null, storage)
  if (isObject(saved) && saved.version === 2) {
    // Every part is checked entry by entry; whatever is damaged is dropped.
    return {
      version: 2,
      countries: sanitizeCountries(saved.countries),
      places: sanitizePlaces(saved.places),
      bests: sanitizeBests(saved.bests),
      history: sanitizeHistory(saved.history),
      xp: sanitizeXp(saved.xp),
      achievements: sanitizeTimes(saved.achievements),
      masteredAt: sanitizeTimes(saved.masteredAt, 400),
      daily: sanitizeDaily(saved.daily),
      weeklyDone: sanitizeWeeklyDone(saved.weeklyDone),
      confusions: sanitizeConfusions(saved.confusions),
      certificates: sanitizeCertificates(saved.certificates),
      cosmetics: { ...DEFAULT_COSMETICS, ...sanitizeCosmeticPicks(saved.cosmetics) },
    }
  }
  return migrateLegacyStats(readJson<unknown>(LEGACY_STATS_KEY, null, storage))
}

/** Runs unknown data through the same checks as loading from storage. */
export function normalizeProfile(raw: unknown): Profile {
  const scratch = memoryStorage()
  saveProfile(raw as Profile, scratch)
  return loadProfile(scratch)
}

export function saveProfile(profile: Profile, storage?: JsonStorage): void {
  writeJson(PROFILE_KEY, profile, storage)
}

/** Deletes all progress, including pre-migration stats so they cannot come back. */
export function clearProfile(storage?: JsonStorage): void {
  removeKey(PROFILE_KEY, storage)
  removeKey(LEGACY_STATS_KEY, storage)
}

/** One skill's stats for every country (or major city) that has any. */
export function skillStats(profile: Profile, skill: Skill, subPack?: SubPackId): StatsByCountry {
  if (subPack) {
    const result: StatsByCountry = {}
    for (const [key, entry] of Object.entries(profile.places)) {
      const parsed = parseSubPlaceKey(key)
      if (parsed && parsed.packId === subPack) result[parsed.unitId] = entry
    }
    return result
  }
  if (skill === 'city') {
    const result: StatsByCountry = {}
    for (const [key, entry] of Object.entries(profile.places)) {
      const id = cityIdFromKey(key)
      if (id) result[id] = entry
    }
    return result
  }
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
