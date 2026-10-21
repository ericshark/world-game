import type { LonLat } from '../geo/coords'
import type { ScoringRegion } from '../geo/scoring'

export const ROUNDS_PER_GAME = 10

export interface GameConfig {
  region: ScoringRegion
  skipMicro: boolean
  practiceWeak: boolean
}

export interface RoundResult {
  targetId: string
  guess: LonLat
  /** The place under the pin, or null for ocean. */
  clickedId: string | null
  distanceKm: number
  /** Closest point of the target to the guess (the guess itself when inside). */
  nearest: LonLat
  points: number
  hit: boolean
}

export interface PlayingState {
  screen: 'playing'
  config: GameConfig
  targetIds: string[]
  /** Index into targetIds. */
  round: number
  pin: LonLat | null
  /** One entry per confirmed round; results[round] exists once the round is revealed. */
  results: RoundResult[]
}

export type GameState =
  | { screen: 'start' }
  | { screen: 'stats' }
  | PlayingState
  | { screen: 'summary'; config: GameConfig; targetIds: string[]; results: RoundResult[] }

export type GameAction =
  | { type: 'start'; config: GameConfig; targetIds: string[] }
  | { type: 'placePin'; point: LonLat }
  | { type: 'confirm'; result: RoundResult }
  | { type: 'next' }
  | { type: 'quit' }
  | { type: 'showStats' }

export const initialGameState: GameState = { screen: 'start' }

export function isRevealed(state: PlayingState): boolean {
  return state.results.length > state.round
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'start':
      return {
        screen: 'playing',
        config: action.config,
        targetIds: action.targetIds,
        round: 0,
        pin: null,
        results: [],
      }

    case 'placePin':
      if (state.screen !== 'playing' || isRevealed(state)) return state
      return { ...state, pin: action.point }

    case 'confirm':
      if (state.screen !== 'playing' || !state.pin || isRevealed(state)) return state
      return { ...state, results: [...state.results, action.result] }

    case 'next':
      if (state.screen !== 'playing' || !isRevealed(state)) return state
      if (state.round + 1 >= state.targetIds.length) {
        return {
          screen: 'summary',
          config: state.config,
          targetIds: state.targetIds,
          results: state.results,
        }
      }
      return { ...state, round: state.round + 1, pin: null }

    case 'quit':
      return { screen: 'start' }

    case 'showStats':
      return { screen: 'stats' }
  }
}
