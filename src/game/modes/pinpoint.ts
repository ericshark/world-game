import { MAX_POINTS, type ScoringRegion } from '../../geo/scoring'
import { evaluateChallenge, type ScoringOptions } from '../core/evaluate'
import type { ModeRules } from '../core/mode'
import { createRandom } from '../core/random'
import {
  advanceRound,
  expireRound,
  startRounds,
  submitRound,
  totalPoints,
  type RoundsState,
} from '../core/rounds'
import {
  nameChoices,
  pickWeighted,
  targetPool,
  weightByDifficulty,
  weightByPractice,
  type Difficulty,
} from '../core/targets'
import type { CountryChallenge, CountryOutcome, RoundResult, Skill } from '../core/types'

export const ROUNDS_PER_GAME = 10

export type PinpointTarget = 'countries' | 'capitals'
/** Find a named place on the globe, or name the place highlighted on it. */
export type PinpointVariant = 'find' | 'name'

export interface PinpointConfig {
  region: ScoringRegion
  difficulty: Difficulty
  target: PinpointTarget
  variant: PinpointVariant
  /** Play on the night-lights globe. */
  night: boolean
  skipMicro: boolean
  practiceWeak: boolean
}

export const DEFAULT_PINPOINT_CONFIG: PinpointConfig = {
  region: 'World',
  difficulty: 'normal',
  target: 'countries',
  variant: 'find',
  night: false,
  skipMicro: false,
  practiceWeak: false,
}

export const DIFFICULTY_RULES: Record<
  Difficulty,
  { cutoffScale: number; roundTimeMs: number | null }
> = {
  easy: { cutoffScale: 1.4, roundTimeMs: null },
  normal: { cutoffScale: 1, roundTimeMs: null },
  hard: { cutoffScale: 0.75, roundTimeMs: 20_000 },
}

export interface PinpointState {
  config: PinpointConfig
  seed: string
  startedAt: number
  endedAt: number | null
  rounds: RoundsState<CountryChallenge>
}

/** Games with the same key are comparable for personal bests. */
export function pinpointBestKey(config: PinpointConfig): string {
  const { target, variant, region, difficulty, skipMicro, night, practiceWeak } = config
  const flags = [skipMicro && 'no-micro', night && 'night', practiceWeak && 'practice']
  const kind = variant === 'name' ? 'name' : target
  return ['pinpoint', kind, region, difficulty, ...flags.filter(Boolean)].join(':')
}

/** The skill a Pinpoint game trains, for stats and weak-country practice. */
export function pinpointSkill(config: PinpointConfig): Skill {
  if (config.variant === 'name') return 'name'
  return config.target === 'capitals' ? 'capital' : 'locate'
}

/** Classic mode: find each named country (or capital) on the globe, or name the one shown. */
export const pinpoint: ModeRules<PinpointConfig, PinpointState> = {
  start({ config, seed, now, geo, players, stats }) {
    const random = createRandom(seed)
    const pool = targetPool(geo.countries.features, config).map((f) => f.properties.id)
    let entries = weightByDifficulty(pool, config.difficulty, geo)
    if (config.practiceWeak && stats) entries = weightByPractice(entries, stats)
    const challenges = pickWeighted(entries, ROUNDS_PER_GAME, random).map(
      (countryId): CountryChallenge => {
        if (config.variant === 'name') {
          const choices = config.difficulty === 'easy' ? nameChoices(geo, countryId, random) : null
          return { kind: 'identify', countryId, choices }
        }
        return { kind: config.target === 'capitals' ? 'capital' : 'locate', countryId }
      },
    )
    return {
      config,
      seed,
      startedAt: now,
      endedAt: null,
      rounds: startRounds(challenges, {
        players,
        now,
        roundTimeMs: DIFFICULTY_RULES[config.difficulty].roundTimeMs,
      }),
    }
  },

  reduce(state, event, geo) {
    const options: ScoringOptions = {
      region: state.config.region,
      cutoffScale: DIFFICULTY_RULES[state.config.difficulty].cutoffScale,
    }
    const evaluate = (
      challenge: CountryChallenge,
      submission: Parameters<typeof evaluateChallenge>[2],
    ) => evaluateChallenge(geo, challenge, submission, options)

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
    const skill = pinpointSkill(next.config)
    return next.rounds.results
      .slice(previous.rounds.results.length)
      .map((round) => outcomeOf(round[playerId], skill))
  },

  summarize(state, playerId) {
    const skill = pinpointSkill(state.config)
    return {
      mode: 'pinpoint',
      bestKey: pinpointBestKey(state.config),
      seed: state.seed,
      startedAt: state.startedAt,
      endedAt: state.endedAt ?? state.startedAt,
      score: totalPoints(state.rounds, playerId),
      maxScore: state.rounds.challenges.length * MAX_POINTS,
      outcomes: state.rounds.results.map((round) => outcomeOf(round[playerId], skill)),
    }
  },
}

function outcomeOf(result: RoundResult, skill: Skill): CountryOutcome {
  return {
    countryId: result.targetId,
    skill,
    success: result.hit,
    distanceKm:
      result.kind === 'locate' || result.kind === 'capital' ? result.distanceKm : undefined,
  }
}
