import type { LonLat } from '../../geo/coords'
import type { Category } from './categories'

/** Every game is shaped for several players; single-player games have just this one. */
export type PlayerId = string
export const LOCAL_PLAYER: PlayerId = 'local'

/** Find the country on the globe. */
export interface LocateChallenge {
  kind: 'locate'
  countryId: string
}

/** Find the country's capital city on the globe. */
export interface CapitalChallenge {
  kind: 'capital'
  countryId: string
}

/** Name the country highlighted on the globe. */
export interface IdentifyChallenge {
  kind: 'identify'
  countryId: string
  /** Multiple-choice options (easy), or null to type the answer. */
  choices: string[] | null
}

/** Name a country that fits the category, then find it on the globe (Rare Earth). */
export interface CategoryChallenge {
  kind: 'category'
  category: Category
}

/** Challenges about one known country. */
export type CountryChallenge = LocateChallenge | CapitalChallenge | IdentifyChallenge

export type Challenge = CountryChallenge | CategoryChallenge

/**
 * What a player sends for a round: only their input, never a score. The host (this browser for
 * now, a server later) evaluates it, so the same rules can run server-side.
 */
export interface Submission {
  at: number
  pin?: LonLat
  /** A country id, for challenges answered by name. */
  answerId?: string
  /** The player revealed a hint before answering. */
  hintUsed?: boolean
}

interface PinResult {
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

export interface LocateResult extends PinResult {
  kind: 'locate'
}

export interface CapitalResult extends PinResult {
  kind: 'capital'
  /** The capital the pin was closest to (some countries have several). */
  capitalName: string
}

export interface IdentifyResult {
  kind: 'identify'
  targetId: string
  answerId: string
  /** "neighbor" earns a little for naming a country next door. */
  verdict: 'correct' | 'neighbor' | 'wrong'
  hintUsed: boolean
  points: number
  hit: boolean
}

export interface CategoryResult extends PinResult {
  kind: 'category'
  /** The country the player named (also targetId, so stats follow it). */
  answerId: string
  categoryId: string
  /** Fits the category and was not already used this game. */
  valid: boolean
  reused: boolean
  /** 0 (the obvious answer) to 1 (the most obscure). */
  rarity: number
  rarityPoints: number
  /** Points for placing the named country, before the rarity multiplier. */
  locatePoints: number
}

/** A player who did not submit before the round closed. */
export interface MissedResult {
  kind: 'missed'
  targetId: string
  points: 0
  hit: false
}

export type RoundResult =
  LocateResult | CapitalResult | IdentifyResult | CategoryResult | MissedResult

export type ModeId = 'pinpoint' | 'rush' | 'rare-earth' | 'mystery' | 'journey' | 'daily' | 'battle'

/** Skills tracked per country across all modes. */
export type Skill = 'locate' | 'capital' | 'name' | 'recall' | 'visit'

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
  /** Mode-specific figures for achievements, e.g. GeoRush's `found` or a journey's `stars`. */
  metrics: Record<string, number>
  /** Set when the game was one of the day's daily puzzles. */
  daily?: { dateKey: string; puzzle: DailyPuzzle }
}

export type DailyPuzzle = 'five' | 'mystery' | 'route'
