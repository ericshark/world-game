import { describe, expect, it } from 'vitest'
import { missedResult } from './evaluate'
import {
  advanceRound,
  currentChallenge,
  expireRound,
  roundsViewFor,
  startRounds,
  submitRound,
  totalPoints,
  type Evaluate,
} from './rounds'
import type { LocateChallenge, RoundResult, Submission } from './types'

const challenges: LocateChallenge[] = [
  { kind: 'locate', countryId: 'PER' },
  { kind: 'locate', countryId: 'BOL' },
]

/** Scores 100 points per degree of longitude, so tests can tell submissions apart. */
const evaluate: Evaluate<LocateChallenge> = (challenge, submission) =>
  submission?.pin
    ? ({
        kind: 'locate',
        targetId: challenge.countryId,
        guess: submission.pin,
        clickedId: null,
        distanceKm: 0,
        nearest: submission.pin,
        points: submission.pin[0] * 100,
        hit: true,
      } satisfies RoundResult)
    : missedResult(challenge.countryId)

const pin = (lon: number, at = 0): Submission => ({ pin: [lon, 0], at })

describe('rounds engine', () => {
  it('plays a single-player game through to the end', () => {
    let state = startRounds(challenges, { players: ['me'], now: 0 })
    expect(currentChallenge(state).countryId).toBe('PER')

    state = submitRound(state, 'me', pin(3), evaluate)
    expect(state.phase).toBe('revealed')
    // A second submission for the same round is ignored.
    expect(submitRound(state, 'me', pin(9), evaluate)).toBe(state)

    state = advanceRound(state, 10)
    expect(state).toMatchObject({ phase: 'open', round: 1, openedAt: 10 })
    state = advanceRound(submitRound(state, 'me', pin(4), evaluate), 20)

    expect(state.phase).toBe('finished')
    expect(totalPoints(state, 'me')).toBe(700)
  })

  it('does not move on before the round is revealed', () => {
    const state = startRounds(challenges, { players: ['me'], now: 0 })
    expect(advanceRound(state, 5)).toBe(state)
  })

  it('waits for every player, then reveals everyone together', () => {
    let state = startRounds(challenges, { players: ['ana', 'ben'], now: 0 })
    state = submitRound(state, 'ana', pin(2), evaluate)
    expect(state.phase).toBe('open')
    expect(state.results).toHaveLength(0)

    state = submitRound(state, 'ben', pin(5), evaluate)
    expect(state.phase).toBe('revealed')
    expect(state.results[0].ana.points).toBe(200)
    expect(state.results[0].ben.points).toBe(500)
  })

  it('ignores players who are not in the game', () => {
    const state = startRounds(challenges, { players: ['ana'], now: 0 })
    expect(submitRound(state, 'mallory', pin(1), evaluate)).toBe(state)
  })

  it('closes a timed round at its deadline and scores missing players as missed', () => {
    let state = startRounds(challenges, { players: ['ana', 'ben'], now: 1000, roundTimeMs: 500 })
    expect(state.deadline).toBe(1500)
    state = submitRound(state, 'ana', pin(1, 1200), evaluate)

    expect(expireRound(state, 1499, evaluate)).toBe(state)
    state = expireRound(state, 1500, evaluate)
    expect(state.phase).toBe('revealed')
    expect(state.results[0].ben).toEqual(missedResult('PER'))

    state = advanceRound(state, 2000)
    expect(state.deadline).toBe(2500)
  })

  it('rejects submissions made after the deadline', () => {
    const state = startRounds(challenges, { players: ['ana'], now: 0, roundTimeMs: 100 })
    expect(submitRound(state, 'ana', pin(1, 101), evaluate)).toBe(state)
  })

  it('hides other players’ submissions until the reveal', () => {
    let state = startRounds(challenges, { players: ['ana', 'ben', 'cy'], now: 0 })
    state = submitRound(state, 'ana', pin(1), evaluate)
    state = submitRound(state, 'ben', pin(2), evaluate)

    expect(Object.keys(roundsViewFor(state, 'ana').submissions[0])).toEqual(['ana'])
    expect(Object.keys(roundsViewFor(state, 'cy').submissions[0])).toEqual([])

    state = submitRound(state, 'cy', pin(3), evaluate)
    expect(Object.keys(roundsViewFor(state, 'cy').submissions[0])).toHaveLength(3)
  })
})
