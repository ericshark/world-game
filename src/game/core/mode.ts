import type { GeoData } from '../../geo/facts'
import type { StatsByCountry } from '../profile/stats'
import type { CountryOutcome, PlayerId, SessionSummary, Submission } from './types'

/** Events every mode understands. Each carries its own time so rules never read the clock. */
export type SessionEvent =
  | { type: 'submit'; playerId: PlayerId; submission: Submission }
  /** Lets timers expire; sent regularly by whoever hosts the game. */
  | { type: 'tick'; at: number }
  | { type: 'next'; at: number }
  /** Stops the clock while the player reads something over the game, such as the rules. */
  | { type: 'pause'; at: number }
  | { type: 'resume'; at: number }

export interface StartParams<Config> {
  config: Config
  seed: string
  now: number
  geo: GeoData
  players: PlayerId[]
  /** The local player's stats, for modes that adapt to them (weak-country practice). */
  stats?: StatsByCountry
}

/**
 * A game mode's rules as pure functions of plain-JSON state: no clock, no Math.random, no
 * rendering. That keeps them easy to test and lets a server run the very same code later.
 */
export interface ModeRules<Config, State, Event = SessionEvent> {
  start(params: StartParams<Config>): State
  reduce(state: State, event: Event, geo: GeoData): State
  isFinished(state: State): boolean
  /** When the host must send a tick for a timer to expire, or null if nothing is pending. */
  deadline(state: State): number | null
  /** Per-country outcomes revealed by moving from one state to the next, for live stats. */
  outcomesBetween(previous: State, next: State, playerId: PlayerId): CountryOutcome[]
  summarize(state: State, playerId: PlayerId): SessionSummary
  /**
   * What a player may be shown of the state when a server hosts the game: later rounds, the
   * seed and any answers they could use to cheat are left out. Without it, the whole state is
   * shown.
   */
  viewFor?(state: State, playerId: PlayerId): State
}
