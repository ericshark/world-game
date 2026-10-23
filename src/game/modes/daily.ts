import { MAX_POINTS } from '../../geo/scoring'
import type { GeoData } from '../../geo/facts'
import { evaluateChallenge } from '../core/evaluate'
import type { ModeRules } from '../core/mode'
import { createRandom, shuffled, type Random } from '../core/random'
import {
  reduceRounds,
  roundsDeadline,
  playerResults,
  startRounds,
  totalPoints,
  type Evaluate,
  type RoundsState,
} from '../core/rounds'
import type { Challenge, CountryOutcome, DailyPuzzle, RoundResult } from '../core/types'
import { skillOf } from '../core/evaluate'
import { dailyNumber } from '../profile/daily'
import { pickCategories, usedAnswers } from './rareEarth'

export interface DailyConfig {
  /** Local date, YYYY-MM-DD. */
  dateKey: string
}

/** A weekly variation: Saturdays at night, Sundays end on a micro-state. */
export type DailyTwist = 'night' | 'micro' | null

/** How many players named each country in a Rare Earth round, for the reveal. */
export interface Crowd {
  total: number
  /** Country id → share of players (0–100) who named it. */
  percent: Record<string, number>
}

export interface DailyState {
  config: DailyConfig
  seed: string
  twist: DailyTwist
  startedAt: number
  endedAt: number | null
  rounds: RoundsState<Challenge>
  /** Added by a server to a revealed Rare Earth round once enough players have answered. */
  crowd?: Crowd | null
}

/** Bump when the generator changes, so old puzzles are not silently rewritten. */
const GENERATOR_VERSION = 1

export function dailySeed(dateKey: string, puzzle: DailyPuzzle): string {
  return `daily:${puzzle}:${dailyNumber(dateKey)}:v${GENERATOR_VERSION}`
}

export function dailyTwist(dateKey: string): DailyTwist {
  const weekday = new Date(`${dateKey}T12:00:00Z`).getUTCDay()
  return weekday === 6 ? 'night' : weekday === 0 ? 'micro' : null
}

/** The round types of the Daily Five, in order. */
export const DAILY_ROUNDS = ['locate', 'identify', 'category', 'capital', 'locate'] as const

/**
 * The same five rounds for everyone on a given day, one of each kind of challenge, getting
 * harder towards the end. The seed alone decides them: offline it comes from the date, and a
 * server uses a secret one so nobody can work out tomorrow's puzzle.
 */
export function dailyChallenges(
  geo: GeoData,
  dateKey: string,
  seed = dailySeed(dateKey, 'five'),
): Challenge[] {
  const random = createRandom(seed)
  const twist = dailyTwist(dateKey)
  const used = new Set<string>()
  const pick = (tiers: number[], micro: boolean | 'only') => {
    const pool = geo.playableIds.filter((id) => {
      const isMicro = geo.feature(id).properties.isMicro
      if (used.has(id) || (micro === 'only' ? !isMicro : !micro && isMicro)) return false
      return micro === 'only' || tiers.includes(geo.difficultyTier(id))
    })
    const id = pickOne(pool, random)
    used.add(id)
    return id
  }

  return [
    { kind: 'locate', countryId: pick([1, 2], false) },
    { kind: 'identify', countryId: pick([2, 3], false), choices: null },
    { kind: 'category', category: pickCategories(geo, 1, random)[0] },
    { kind: 'capital', countryId: pick([2, 3, 4], false) },
    { kind: 'locate', countryId: twist === 'micro' ? pick([], 'only') : pick([4, 5], false) },
  ]
}

export const daily: ModeRules<DailyConfig, DailyState> = {
  start({ config, seed, now, geo, players }) {
    return {
      config,
      seed,
      twist: dailyTwist(config.dateKey),
      startedAt: now,
      endedAt: null,
      rounds: startRounds(dailyChallenges(geo, config.dateKey, seed), { players, now }),
    }
  },

  reduce(state, event, geo) {
    const evaluate: Evaluate<Challenge> = (challenge, submission, playerId) =>
      evaluateChallenge(geo, challenge, submission, {
        region: 'World',
        cutoffScale: 1,
        usedAnswers: usedAnswers(state.rounds, playerId),
      })
    const rounds = reduceRounds(state.rounds, event, evaluate)
    if (rounds === state.rounds) return state
    const ended = rounds.phase === 'finished' && event.type === 'next'
    return { ...state, rounds, endedAt: ended ? event.at : state.endedAt }
  },

  isFinished: (state) => state.rounds.phase === 'finished',

  deadline: (state) => roundsDeadline(state.rounds),

  outcomesBetween(previous, next, playerId) {
    return next.rounds.results
      .slice(previous.rounds.results.length)
      .flatMap((round, offset) =>
        outcomeOf(next.rounds.challenges[previous.rounds.results.length + offset], round[playerId]),
      )
  },

  viewFor(state) {
    return { ...state, seed: '', rounds: redactRounds(state.rounds) }
  },

  summarize(state, playerId) {
    const results = playerResults(state.rounds, playerId)
    return {
      mode: 'daily',
      bestKey: 'daily:five',
      seed: state.seed,
      startedAt: state.startedAt,
      endedAt: state.endedAt ?? state.startedAt,
      score: totalPoints(state.rounds, playerId),
      maxScore: state.rounds.challenges.length * MAX_POINTS,
      outcomes: results.flatMap((result, i) => outcomeOf(state.rounds.challenges[i], result)),
      metrics: Object.fromEntries(results.map((result, i) => [`tone${i}`, toneIndex(result)])),
    }
  },
}

/**
 * Rounds the player has not reached are blanked, and so are a category's accepted answers while
 * it is still open: a client only needs them once the round is revealed.
 */
function redactRounds(rounds: RoundsState<Challenge>): RoundsState<Challenge> {
  return {
    ...rounds,
    challenges: rounds.challenges.map((challenge, index) => {
      const revealed = index < rounds.round || (index === rounds.round && rounds.phase !== 'open')
      return revealed ? challenge : hide(challenge, index === rounds.round)
    }),
  }
}

/** The same kind of round with nothing to look up; the current round keeps what it is about. */
function hide(challenge: Challenge, current: boolean): Challenge {
  if (challenge.kind === 'category') {
    const { id, kind, prompt } = challenge.category
    // A hidden round keeps only its shape; the placeholder kind says nothing about the category.
    return {
      kind: 'category',
      category: current
        ? { id, kind, prompt, valid: [], lenient: [] }
        : { id: '', kind: 'subregion', prompt: '', valid: [], lenient: [] },
    }
  }
  return current ? challenge : { ...challenge, countryId: '' }
}

/** 0 (miss) to 4 (perfect), for the shareable grid. */
export function toneIndex(result: RoundResult): number {
  if (result.hit && result.kind !== 'category') return 4
  if (result.points >= 600) return 3
  if (result.points >= 300) return 2
  if (result.points >= 50) return 1
  return 0
}

function outcomeOf(challenge: Challenge, result: RoundResult): CountryOutcome[] {
  if (result.kind === 'missed') return []
  if (result.kind === 'category') {
    return [{ countryId: result.answerId, skill: 'recall', success: result.valid }]
  }
  return [
    {
      countryId: result.targetId,
      skill: skillOf(challenge),
      success: result.hit,
      distanceKm: 'distanceKm' in result ? result.distanceKm : undefined,
    },
  ]
}

function pickOne(pool: string[], random: Random): string {
  if (pool.length === 0) throw new Error('No country left for the daily puzzle')
  return shuffled(pool, random)[0]
}
