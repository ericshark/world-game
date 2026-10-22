import type { RoundResult } from '../game/core/types'

/** Consecutive successes at the end of the list. */
export function trailingHits(results: RoundResult[]): number {
  let count = 0
  for (let i = results.length - 1; i >= 0 && results[i].hit; i--) count++
  return count
}

export function bestStreak(results: RoundResult[]): number {
  let best = 0
  let current = 0
  for (const result of results) {
    current = result.hit ? current + 1 : 0
    best = Math.max(best, current)
  }
  return best
}
