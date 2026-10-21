import type { RoundResult } from './gameReducer'
import { readJson, removeKey, writeJson, type JsonStorage } from './storage'

const STATS_KEY = 'world-game:stats:v1'

export interface CountryStats {
  attempts: number
  hits: number
  totalKm: number
}

export type StatsByCountry = Record<string, CountryStats>

export function loadStats(storage?: JsonStorage): StatsByCountry {
  const stats = readJson<unknown>(STATS_KEY, {}, storage)
  return stats && typeof stats === 'object' ? (stats as StatsByCountry) : {}
}

export function saveStats(stats: StatsByCountry, storage?: JsonStorage): void {
  writeJson(STATS_KEY, stats, storage)
}

export function clearStats(storage?: JsonStorage): void {
  removeKey(STATS_KEY, storage)
}

export function recordResult(stats: StatsByCountry, result: RoundResult): StatsByCountry {
  const previous = stats[result.targetId] ?? { attempts: 0, hits: 0, totalKm: 0 }
  return {
    ...stats,
    [result.targetId]: {
      attempts: previous.attempts + 1,
      hits: previous.hits + (result.hit ? 1 : 0),
      totalKm: previous.totalKm + result.distanceKm,
    },
  }
}

export function accuracy({ attempts, hits }: CountryStats): number {
  return attempts === 0 ? 0 : hits / attempts
}
