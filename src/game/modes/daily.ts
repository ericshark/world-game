import { MAX_POINTS } from '../../geo/scoring'
import type { GeoData } from '../../geo/facts'
import { evaluateChallenge } from '../core/evaluate'
import type { ModeRules } from '../core/mode'
import { createRandom, shuffled, type Random } from '../core/random'
import {
  advanceRound,
  expireRound,
  playerResults,
  startRounds,
  submitRound,
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

export interface DailyState {
  config: DailyConfig
  seed: string
  twist: DailyTwist
  startedAt: number
  endedAt: number | null
  rounds: RoundsState<Challenge>
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
 * harder towards the end. Generated from the date alone, so no server is needed.
 */
export function dailyChallenges(geo: GeoData, dateKey: string): Challenge[] {
  const random = createRandom(dailySeed(dateKey, 'five'))
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
  start({ config, now, geo, players }) {
    return {
      config,
      seed: dailySeed(config.dateKey, 'five'),
      twist: dailyTwist(config.dateKey),
      startedAt: now,
      endedAt: null,
      rounds: startRounds(dailyChallenges(geo, config.dateKey), { players, now }),
    }
  },

  reduce(state, event, geo) {
    const evaluate: Evaluate<Challenge> = (challenge, submission, playerId) =>
      evaluateChallenge(geo, challenge, submission, {
        region: 'World',
        cutoffScale: 1,
        usedAnswers: usedAnswers(state.rounds, playerId),
      })
    switch (event.type) {
      case 'submit':
        return {
          ...state,
          rounds: submitRound(state.rounds, event.playerId, event.submission, evaluate),
        }
      case 'tick':
        return { ...state, rounds: expireRound(state.rounds, event.at, evaluate) }
      case 'next': {
        const rounds = advanceRound(state.rounds, event.at)
        return { ...state, rounds, endedAt: rounds.phase === 'finished' ? event.at : null }
      }
    }
  },

  isFinished: (state) => state.rounds.phase === 'finished',

  deadline: (state) => state.rounds.deadline,

  outcomesBetween(previous, next, playerId) {
    return next.rounds.results
      .slice(previous.rounds.results.length)
      .flatMap((round, offset) =>
        outcomeOf(next.rounds.challenges[previous.rounds.results.length + offset], round[playerId]),
      )
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
