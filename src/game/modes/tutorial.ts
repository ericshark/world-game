import { MAX_POINTS } from '../../geo/scoring'
import { evaluateChallenge } from '../core/evaluate'
import type { ModeRules } from '../core/mode'
import {
  reduceRounds,
  roundsDeadline,
  startRounds,
  totalPoints,
  type RoundsState,
} from '../core/rounds'
import type { CountryOutcome, LocateChallenge, PlayerId } from '../core/types'

/** Seen once the tour has been offered and started, so the home screen stops offering it. */
export const TOUR_KEY = 'tour'

/** Big, familiar countries on three continents: easy to find while learning the controls. */
export const TUTORIAL_TARGETS = ['BRA', 'AUS', 'JPN']

export interface TutorialState {
  seed: string
  startedAt: number
  endedAt: number | null
  rounds: RoundsState<LocateChallenge>
}

/** The guided first game: three easy rounds of Pinpoint, always the same, with no clock. */
export const tutorial: ModeRules<Record<string, never>, TutorialState> = {
  start: ({ seed, now, players }) => ({
    seed,
    startedAt: now,
    endedAt: null,
    rounds: startRounds(
      TUTORIAL_TARGETS.map((countryId) => ({ kind: 'locate', countryId })),
      { players, now },
    ),
  }),

  reduce(state, event, geo) {
    const rounds = reduceRounds(state.rounds, event, (challenge, submission) =>
      // Scored like Easy Pinpoint, so a first try still earns something.
      evaluateChallenge(geo, challenge, submission, { region: 'World', cutoffScale: 1.4 }),
    )
    if (rounds === state.rounds) return state
    const ended = rounds.phase === 'finished' && event.type === 'next'
    return { ...state, rounds, endedAt: ended ? event.at : state.endedAt }
  },

  isFinished: (state) => state.rounds.phase === 'finished',

  deadline: (state) => roundsDeadline(state.rounds),

  outcomesBetween(previous, next, playerId) {
    return outcomesOf(next.rounds.results.slice(previous.rounds.results.length), playerId)
  },

  summarize(state, playerId) {
    return {
      mode: 'pinpoint',
      // A best of its own, so the tour never counts as a Pinpoint record.
      bestKey: 'tutorial',
      seed: state.seed,
      startedAt: state.startedAt,
      endedAt: state.endedAt ?? state.startedAt,
      score: totalPoints(state.rounds, playerId),
      maxScore: state.rounds.challenges.length * MAX_POINTS,
      outcomes: outcomesOf(state.rounds.results, playerId),
      metrics: { hits: state.rounds.results.filter((round) => round[playerId].hit).length },
    }
  },
}

function outcomesOf(rounds: RoundsState['results'], playerId: PlayerId): CountryOutcome[] {
  return rounds.map((round) => ({
    countryId: round[playerId].targetId,
    skill: 'locate',
    success: round[playerId].hit,
  }))
}
