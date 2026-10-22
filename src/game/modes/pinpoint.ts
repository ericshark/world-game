import { MAX_POINTS, type ScoringRegion } from '../../geo/scoring'
import { evaluateLocate, missedResult } from '../core/evaluate'
import type { ModeRules } from '../core/mode'
import { createRandom } from '../core/random'
import {
  advanceRound,
  expireRound,
  startRounds,
  submitRound,
  totalPoints,
  type Evaluate,
  type RoundsState,
} from '../core/rounds'
import { selectTargets, targetPool } from '../core/targets'
import type { CountryOutcome, LocateChallenge, RoundResult } from '../core/types'

export const ROUNDS_PER_GAME = 10

export interface PinpointConfig {
  region: ScoringRegion
  skipMicro: boolean
  practiceWeak: boolean
}

export interface PinpointState {
  config: PinpointConfig
  seed: string
  startedAt: number
  endedAt: number | null
  rounds: RoundsState<LocateChallenge>
}

/** Classic mode: find each named country on the borderless globe. */
export const pinpoint: ModeRules<PinpointConfig, PinpointState> = {
  start({ config, seed, now, geo, players, stats }) {
    const pool = targetPool(geo.countries.features, config)
    const targetIds = selectTargets(pool, ROUNDS_PER_GAME, {
      random: createRandom(seed),
      stats: config.practiceWeak ? stats : undefined,
    })
    const challenges = targetIds.map((countryId) => ({ kind: 'locate' as const, countryId }))
    return {
      config,
      seed,
      startedAt: now,
      endedAt: null,
      rounds: startRounds(challenges, { players, now }),
    }
  },

  reduce(state, event, geo) {
    const evaluate: Evaluate<LocateChallenge> = (challenge, submission) =>
      submission
        ? evaluateLocate(geo.countries, challenge.countryId, submission.pin, state.config.region)
        : missedResult(challenge.countryId)

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
      .map((round) => outcomeOf(round[playerId]))
  },

  summarize(state, playerId) {
    const { region, skipMicro, practiceWeak } = state.config
    const variant = [region, skipMicro && 'no-micro', practiceWeak && 'practice'].filter(Boolean)
    const results = state.rounds.results.map((round) => round[playerId])
    return {
      mode: 'pinpoint',
      bestKey: ['pinpoint', ...variant].join(':'),
      seed: state.seed,
      startedAt: state.startedAt,
      endedAt: state.endedAt ?? state.startedAt,
      score: totalPoints(state.rounds, playerId),
      maxScore: state.rounds.challenges.length * MAX_POINTS,
      outcomes: results.map(outcomeOf),
    }
  },
}

function outcomeOf(result: RoundResult): CountryOutcome {
  return {
    countryId: result.targetId,
    skill: 'locate',
    success: result.hit,
    distanceKm: result.kind === 'locate' ? result.distanceKm : undefined,
  }
}
