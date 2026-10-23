import type { DailyPuzzle } from '../game/core/types'
import { api } from './api'

export interface BoardRow {
  rank: number
  name: string
  value: number
  count?: number
  you: boolean
}

export interface Board {
  rows: BoardRow[]
  me: { rank: number; value: number; count?: number; percentile?: number } | null
  total: number
  /** For ladders: how close the player is to qualifying. */
  progress?: { have: number; need: number }
}

export const fetchDailyBoard = (puzzle: DailyPuzzle, dateKey: string) =>
  api<Board>(`/leaderboards/daily?puzzle=${puzzle}&date=${dateKey}`)
export const fetchDuelBoard = () => api<Board>('/leaderboards/duel')
export const fetchAllTimeBoard = () => api<Board>('/leaderboards/alltime')
