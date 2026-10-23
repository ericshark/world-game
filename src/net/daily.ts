import type { DailyPuzzle } from '../game/core/types'
import { api } from './api'

/** The server's answer about a ranked daily attempt. The view is the game state a player may see. */
export interface RankedDaily<State = unknown> {
  number: number
  status: 'open' | 'finished'
  /** False when a move was ignored (for example, one that was not allowed). */
  changed: boolean
  view: State
  score: number | null
}

/** Begins today's puzzle, or picks up where this player left off; each puzzle is played once. */
export const startRankedDaily = <State>(puzzle: DailyPuzzle, dateKey: string) =>
  api<RankedDaily<State>>(`/daily/${puzzle}/start`, { body: { dateKey } })

export const sendRankedDaily = <State>(puzzle: DailyPuzzle, dateKey: string, event: object) =>
  api<RankedDaily<State>>(`/daily/${puzzle}/send`, { body: { dateKey, event } })
