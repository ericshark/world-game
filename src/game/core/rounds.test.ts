import { describe, expect, it } from 'vitest'
import { missedResult } from './evaluate'
import {
  advanceRound,
  currentChallenge,
  expireRound,
  pauseRounds,
  reduceRounds,
  resumeRounds,
  roundsDeadline,
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

  it('hurries everyone else once the first player submits', () => {
    let state = startRounds(challenges, {
      players: ['ana', 'ben'],
      now: 0,
      roundTimeMs: 25_000,
      hurryMs: 10_000,
    })
    state = submitRound(state, 'ana', pin(1, 3_000), evaluate)
    expect(state.deadline).toBe(13_000)
    // A late first submission cannot extend the round.
    let late = startRounds(challenges, {
      players: ['ana', 'ben'],
      now: 0,
      roundTimeMs: 25_000,
      hurryMs: 10_000,
    })
    late = submitRound(late, 'ana', pin(1, 20_000), evaluate)
    expect(late.deadline).toBe(25_000)
  })

  it('rejects submissions made after the deadline', () => {
    const state = startRounds(challenges, { players: ['ana'], now: 0, roundTimeMs: 100 })
    expect(submitRound(state, 'ana', pin(1, 101), evaluate)).toBe(state)
  })

  it('shows who has answered, but not their answers, until the reveal', () => {
    let state = startRounds(challenges, { players: ['ana', 'ben', 'cy'], now: 0 })
    state = submitRound(state, 'ana', pin(1, 4), evaluate)
    state = submitRound(state, 'ben', pin(2, 6), evaluate)

    expect(roundsViewFor(state, 'ana').submissions[0]).toEqual({ ana: pin(1, 4), ben: { at: 6 } })
    expect(roundsViewFor(state, 'cy').submissions[0]).toEqual({ ana: { at: 4 }, ben: { at: 6 } })

    state = submitRound(state, 'cy', pin(3), evaluate)
    expect(Object.keys(roundsViewFor(state, 'cy').submissions[0])).toHaveLength(3)
  })

  it('stops the clock while paused and adds the paused time back', () => {
    let state = startRounds(challenges, { players: ['me'], now: 0, roundTimeMs: 20_000 })
    state = pauseRounds(state, 5_000)
    expect(roundsDeadline(state)).toBeNull()
    // Nothing times out while paused, however long the player reads.
    expect(expireRound(state, 60_000, evaluate)).toBe(state)

    state = resumeRounds(state, 65_000)
    expect(state.pausedAt).toBeNull()
    expect(roundsDeadline(state)).toBe(80_000)
    expect(expireRound(state, 79_999, evaluate).phase).toBe('open')
    expect(expireRound(state, 80_000, evaluate).phase).toBe('revealed')
  })

  it('accepts a submission made while paused, as of the moment the clock stopped', () => {
    let state = startRounds(challenges, { players: ['me'], now: 0, roundTimeMs: 1_000 })
    state = pauseRounds(state, 500)
    expect(submitRound(state, 'me', pin(1, 9_000), evaluate).phase).toBe('revealed')
  })

  it('ignores pauses in untimed rounds and repeated pauses', () => {
    const untimed = startRounds(challenges, { players: ['me'], now: 0 })
    expect(pauseRounds(untimed, 10)).toBe(untimed)
    const timed = pauseRounds(
      startRounds(challenges, { players: ['me'], now: 0, roundTimeMs: 1_000 }),
      10,
    )
    expect(pauseRounds(timed, 20)).toBe(timed)
  })

  it('handles the shared session events', () => {
    let state = startRounds(challenges, { players: ['me'], now: 0, roundTimeMs: 1_000 })
    state = reduceRounds(state, { type: 'pause', at: 100 }, evaluate)
    state = reduceRounds(state, { type: 'resume', at: 600 }, evaluate)
    expect(state.deadline).toBe(1_500)
    state = reduceRounds(state, { type: 'tick', at: 1_500 }, evaluate)
    expect(state.phase).toBe('revealed')
    state = reduceRounds(state, { type: 'next', at: 1_600 }, evaluate)
    expect(state).toMatchObject({ round: 1, deadline: 2_600 })
  })
})
