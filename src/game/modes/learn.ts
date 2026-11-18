import { MAX_POINTS } from '../../geo/scoring'
import { evaluateChallenge, type ScoringOptions } from '../core/evaluate'
import type { ModeRules } from '../core/mode'
import { createRandom } from '../core/random'
import {
  reduceRounds,
  roundsDeadline,
  startRounds,
  totalPoints,
  type RoundsState,
} from '../core/rounds'
import { REGIONS, type Region } from '../../geo/countries'
import { mistakenFor } from '../core/confusions'
import { nameChoices } from '../core/targets'
import type { CountryChallenge, CountryOutcome, RoundResult } from '../core/types'
import type { LearnItem } from './learnQueue'

/** Share of an exam's countries that must be found to pass. */
export const EXAM_PASS_SHARE = 0.9

export interface LearnConfig {
  queue: LearnItem[]
  /** A regional exam: every country once, no re-asks, and a pass earns a certificate. */
  exam?: { region: Region }
  /** Shown in the HUD: the lesson's name, or "Review". */
  title: string
}

export interface LearnState {
  config: LearnConfig
  seed: string
  startedAt: number
  endedAt: number | null
  rounds: RoundsState<CountryChallenge>
  /** Questions already asked a second time, so a miss is re-asked once and no more. */
  retried: string[]
}

/** Learning is forgiving: points do not matter, but a near miss should not look like a hit. */
const OPTIONS: ScoringOptions = { region: 'World', cutoffScale: 1.4 }

export const DEFAULT_LEARN_CONFIG: LearnConfig = { queue: [], title: 'Review' }

function challengeFor(item: LearnItem, geo: Parameters<typeof nameChoices>[0], seed: string) {
  const { countryId, skill, assist } = item
  if (skill === 'name') {
    const random = createRandom(`${seed}:${countryId}`)
    return {
      kind: 'identify',
      countryId,
      choices: assist ? nameChoices(geo, countryId, random) : null,
    } satisfies CountryChallenge
  }
  return { kind: skill, countryId } satisfies CountryChallenge
}

function keyOf(challenge: CountryChallenge) {
  return `${challenge.kind}:${challenge.countryId}`
}

/**
 * Learn: a lesson's questions or a spaced review, played like Pinpoint. A question answered
 * wrongly comes back once at the end of the session.
 */
export const learn: ModeRules<LearnConfig, LearnState> = {
  start({ config, seed, now, geo, players }) {
    const challenges = config.queue.map((item) => challengeFor(item, geo, seed))
    return {
      config,
      seed,
      startedAt: now,
      endedAt: null,
      rounds: startRounds(challenges, { players, now }),
      retried: [],
    }
  },

  reduce(state, event, geo) {
    const evaluate = (
      challenge: CountryChallenge,
      submission: Parameters<typeof evaluateChallenge>[2],
    ) => evaluateChallenge(geo, challenge, submission, OPTIONS)
    let rounds = reduceRounds(state.rounds, event, evaluate)
    if (rounds === state.rounds) return state

    let retried = state.retried
    // A miss just revealed: ask it again at the end, once.
    if (rounds.results.length > state.rounds.results.length) {
      const index = rounds.results.length - 1
      const challenge = rounds.challenges[index]
      const missed = Object.values(rounds.results[index]).some((result) => !result.hit)
      if (missed && !state.config.exam && !retried.includes(keyOf(challenge))) {
        retried = [...retried, keyOf(challenge)]
        rounds = { ...rounds, challenges: [...rounds.challenges, challenge] }
      }
    }
    const ended = rounds.phase === 'finished' && event.type === 'next'
    return { ...state, rounds, retried, endedAt: ended ? event.at : state.endedAt }
  },

  isFinished: (state) => state.rounds.phase === 'finished',

  deadline: (state) => roundsDeadline(state.rounds),

  outcomesBetween(previous, next, playerId) {
    return next.rounds.results
      .slice(previous.rounds.results.length)
      .map((round, i) =>
        outcomeOf(round[playerId], next.rounds.challenges[previous.rounds.results.length + i]),
      )
  },

  summarize(state, playerId) {
    return {
      mode: 'learn',
      bestKey: state.config.exam ? `learn:exam:${state.config.exam.region}` : 'learn',
      seed: state.seed,
      startedAt: state.startedAt,
      endedAt: state.endedAt ?? state.startedAt,
      score: totalPoints(state.rounds, playerId),
      maxScore: state.rounds.challenges.length * MAX_POINTS,
      outcomes: state.rounds.results.map((round, i) =>
        outcomeOf(round[playerId], state.rounds.challenges[i]),
      ),
      metrics: {
        ...examMetrics(state, playerId),
        asked: state.rounds.results.length,
        retried: state.retried.length,
        correct: state.rounds.results.filter((round) => round[playerId].hit).length,
      },
    }
  },
}

function outcomeOf(result: RoundResult, challenge: CountryChallenge): CountryOutcome {
  const skill = challenge.kind === 'identify' ? 'name' : challenge.kind
  return {
    countryId: result.targetId,
    skill,
    success: result.hit,
    distanceKm:
      result.kind === 'locate' || result.kind === 'capital' ? result.distanceKm : undefined,
    mistakenFor: mistakenFor(result),
  }
}

/** An exam is passed by finding 90% of its countries, and only counts once it is complete. */
function examMetrics(state: LearnState, playerId: string): Record<string, number> {
  if (!state.config.exam) return {}
  const results = state.rounds.results.map((round) => round[playerId])
  const complete = results.length === state.rounds.challenges.length
  const passed = complete && results.filter((r) => r.hit).length >= EXAM_PASS_SHARE * results.length
  return {
    exam: 1,
    examRegion: REGIONS.indexOf(state.config.exam.region),
    examPassed: passed ? 1 : 0,
  }
}
