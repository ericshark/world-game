import type { DailyPuzzle } from '../core/types'
import { readJson, writeJson, type JsonStorage } from './storage'

const PROGRESS_KEY = 'world-game:daily-progress:v1'

/** Today's unfinished daily puzzles, saved after every move. */
interface SavedProgress {
  dateKey: string
  games: Partial<Record<DailyPuzzle, { seed: string }>>
}

/**
 * The unfinished attempt at a daily puzzle, if one was saved today for the same seed. A daily
 * puzzle gets one attempt, so leaving it part-way resumes it rather than starting over.
 */
export function loadDailyProgress<State extends { seed: string }>(
  dateKey: string,
  puzzle: DailyPuzzle,
  seed: string,
  storage?: JsonStorage,
): State | null {
  const saved = readJson<SavedProgress | null>(PROGRESS_KEY, null, storage)
  if (saved?.dateKey !== dateKey) return null
  const game = saved.games?.[puzzle]
  return game && game.seed === seed ? (game as State) : null
}

/** Saves a puzzle's state; older days are dropped, as they can no longer be played. */
export function saveDailyProgress(
  dateKey: string,
  puzzle: DailyPuzzle,
  state: { seed: string },
  storage?: JsonStorage,
): void {
  const saved = readJson<SavedProgress | null>(PROGRESS_KEY, null, storage)
  const games = saved?.dateKey === dateKey ? saved.games : {}
  writeJson(PROGRESS_KEY, { dateKey, games: { ...games, [puzzle]: state } }, storage)
}
