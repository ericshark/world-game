import type { LonLat } from '../../geo/coords'

/** Every game is shaped for several players; single-player games have just this one. */
export type PlayerId = string
export const LOCAL_PLAYER: PlayerId = 'local'

export interface LocateChallenge {
  kind: 'locate'
  countryId: string
}

export type Challenge = LocateChallenge

/**
 * What a player sends for a round: only their input, never a score. The host (this browser for
 * now, a server later) evaluates it, so the same rules can run server-side.
 */
export interface Submission {
  pin: LonLat
  at: number
}

export interface LocateResult {
  kind: 'locate'
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

/** A player who did not submit before the round closed. */
export interface MissedResult {
  kind: 'missed'
  targetId: string
  points: 0
  hit: false
}

export type RoundResult = LocateResult | MissedResult

export type ModeId = 'pinpoint'

/** Skills tracked per country across all modes. */
export type Skill = 'locate'

export interface CountryOutcome {
  countryId: string
  skill: Skill
  success: boolean
  distanceKm?: number
}

/**
 * The common result of any finished game. Stats, personal bests and history (and later
 * progression) are all derived from it, so every mode feeds the same pipeline.
 */
export interface SessionSummary {
  mode: ModeId
  /** Games with the same key are comparable for personal bests, e.g. "pinpoint:Europe". */
  bestKey: string
  seed: string
  startedAt: number
  endedAt: number
  score: number
  maxScore: number | null
  outcomes: CountryOutcome[]
}
