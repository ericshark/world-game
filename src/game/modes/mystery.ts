import { bearingDegrees } from '../../geo/distance'
import type { GeoData } from '../../geo/facts'
import type { ModeRules, SessionEvent } from '../core/mode'
import { createRandom, randomInt } from '../core/random'
import type { CountryOutcome, PlayerId } from '../core/types'

export interface MysteryConfig {
  /** Hard can pick any country, including micro-states. */
  difficulty: 'normal' | 'hard'
}

export const DEFAULT_MYSTERY_CONFIG: MysteryConfig = { difficulty: 'normal' }
export const MYSTERY_MAX_POINTS = 1000
const POINTS_PER_EXTRA_GUESS = 100
const MIN_POINTS = 100
/** The continent hint costs as much as this many guesses. */
export const HINT_COST = 2
/** The hint becomes available after this many guesses. */
export const HINT_AFTER = 6
/** Found within this many guesses counts as knowing where it is, for stats. */
const KNOWN_WITHIN = 6

export interface MysteryGuess {
  countryId: string
  /** Border to border; 0 for neighbours (and the answer). */
  distanceKm: number
  /** From the guess towards the mystery country. */
  bearing: number
  at: number
}

export interface MysteryState {
  config: MysteryConfig
  seed: string
  player: PlayerId
  startedAt: number
  endedAt: number | null
  targetId: string
  guesses: MysteryGuess[]
  hintUsed: boolean
  /** The continent, once the hint is used, so a view that hides the target can show it. */
  hintRegion?: string
  gaveUp: boolean
}

export type MysteryEvent =
  | SessionEvent
  | { type: 'hint'; playerId: PlayerId; at: number }
  | { type: 'giveUp'; playerId: PlayerId; at: number }

export function mysteryBestKey(config: MysteryConfig): string {
  return `mystery:${config.difficulty}`
}

/** 1,000 for a first-guess find, 100 less per extra guess (the hint counts as two), at least 100. */
export function mysteryScore(state: MysteryState): number {
  if (!isSolved(state)) return 0
  const used = state.guesses.length + (state.hintUsed ? HINT_COST : 0)
  return Math.max(MIN_POINTS, MYSTERY_MAX_POINTS - POINTS_PER_EXTRA_GUESS * (used - 1))
}

export function isSolved(state: MysteryState): boolean {
  return state.guesses.at(-1)?.countryId === state.targetId
}

/** The pool a mystery country is drawn from. */
export function mysteryPool(geo: GeoData, config: MysteryConfig): string[] {
  return geo.playableIds.filter(
    (id) => config.difficulty === 'hard' || !geo.feature(id).properties.isMicro,
  )
}

/**
 * Hot and cold: guess any country, learn how far it is from the hidden one and in which
 * direction, and close in with as few guesses as you can.
 */
export const mystery: ModeRules<MysteryConfig, MysteryState, MysteryEvent> = {
  start({ config, seed, now, geo, players }) {
    const pool = mysteryPool(geo, config)
    return {
      config,
      seed,
      player: players[0],
      startedAt: now,
      endedAt: null,
      targetId: pool[randomInt(createRandom(seed), pool.length)],
      guesses: [],
      hintUsed: false,
      gaveUp: false,
    }
  },

  reduce(state, event, geo) {
    if (state.endedAt !== null) return state
    switch (event.type) {
      // No clock to stop.
      case 'tick':
      case 'next':
      case 'pause':
      case 'resume':
        return state
      case 'hint':
        if (event.playerId !== state.player || state.hintUsed) return state
        if (state.guesses.length < HINT_AFTER) return state
        return {
          ...state,
          hintUsed: true,
          hintRegion: geo.feature(state.targetId).properties.region,
        }
      case 'giveUp':
        if (event.playerId !== state.player) return state
        return { ...state, gaveUp: true, endedAt: event.at }
      case 'submit': {
        const { answerId, pin, at } = event.submission
        if (event.playerId !== state.player) return state
        // A guess is a country: typed, or the one under a pin on the globe.
        const guessId = answerId ?? (pin ? geo.countries.countryAt(pin)?.properties.id : undefined)
        if (!guessId || !geo.playableIds.includes(guessId)) return state
        if (state.guesses.some((g) => g.countryId === guessId)) return state
        const guess: MysteryGuess = {
          countryId: guessId,
          distanceKm: geo.borderDistanceKm(guessId, state.targetId),
          bearing: bearingDegrees(geo.factsOf(guessId).label, geo.factsOf(state.targetId).label),
          at,
        }
        const guesses = [...state.guesses, guess]
        return { ...state, guesses, endedAt: guessId === state.targetId ? at : null }
      }
    }
  },

  viewFor: (state) => ({
    ...state,
    seed: '',
    // Who the player is looking for stays hidden until they have found it or given up.
    targetId: state.endedAt === null ? '' : state.targetId,
  }),

  isFinished: (state) => state.endedAt !== null,

  deadline: () => null,

  outcomesBetween(previous, next) {
    return previous.endedAt === null && next.endedAt !== null ? [outcomeOf(next)] : []
  },

  summarize(state) {
    return {
      mode: 'mystery',
      bestKey: mysteryBestKey(state.config),
      seed: state.seed,
      startedAt: state.startedAt,
      endedAt: state.endedAt ?? state.startedAt,
      score: mysteryScore(state),
      maxScore: MYSTERY_MAX_POINTS,
      outcomes: state.endedAt === null ? [] : [outcomeOf(state)],
      metrics: { guesses: state.guesses.length, solved: isSolved(state) ? 1 : 0 },
    }
  },
}

function outcomeOf(state: MysteryState): CountryOutcome {
  return {
    countryId: state.targetId,
    skill: 'locate',
    success: isSolved(state) && state.guesses.length <= KNOWN_WITHIN,
  }
}
