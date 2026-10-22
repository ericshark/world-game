import { describe, expect, it } from 'vitest'
import { loadTestGeoData } from '../../test/loadTestCountries'
import { LOCAL_PLAYER, type Submission } from '../core/types'
import {
  DEFAULT_PINPOINT_CONFIG,
  pinpoint,
  pinpointSkill,
  ROUNDS_PER_GAME,
  type PinpointConfig,
  type PinpointState,
} from './pinpoint'

const geo = loadTestGeoData()
const world = DEFAULT_PINPOINT_CONFIG

function start(config: PinpointConfig = world, seed = 'seed-1'): PinpointState {
  return pinpoint.start({ config, seed, now: 0, geo, players: [LOCAL_PLAYER] })
}

function submit(state: PinpointState, submission: Submission): PinpointState {
  return pinpoint.reduce(state, { type: 'submit', playerId: LOCAL_PLAYER, submission }, geo)
}

/** A perfect answer for whatever the current challenge is. */
function answer(state: PinpointState, at: number): PinpointState {
  const challenge = state.rounds.challenges[state.rounds.round]
  const facts = geo.factsOf(challenge.countryId)
  switch (challenge.kind) {
    case 'locate':
      return submit(state, { pin: facts.label, at })
    case 'capital':
      return submit(state, { pin: facts.capitals[0].at, at })
    case 'identify':
      return submit(state, { answerId: challenge.countryId, at })
  }
}

function playThrough(state: PinpointState): PinpointState {
  for (let round = 0; round < state.rounds.challenges.length; round++) {
    state = answer(state, round * 10)
    state = pinpoint.reduce(state, { type: 'next', at: round * 10 + 5 }, geo)
  }
  return state
}

describe('pinpoint', () => {
  it('asks for 10 distinct countries, the same ones for the same seed', () => {
    const state = start()
    const ids = state.rounds.challenges.map((c) => c.countryId)
    expect(ids).toHaveLength(ROUNDS_PER_GAME)
    expect(new Set(ids).size).toBe(ROUNDS_PER_GAME)
    expect(start().rounds.challenges).toEqual(state.rounds.challenges)
    expect(start(world, 'other').rounds.challenges).not.toEqual(state.rounds.challenges)
  })

  it('uses the whole pool when the region has fewer than 10 countries', () => {
    const oceania = start({ ...world, region: 'Oceania', skipMicro: true })
    expect(oceania.rounds.challenges.length).toBeLessThan(ROUNDS_PER_GAME)
  })

  it('plays through to a perfect summary, recording outcomes as it goes', () => {
    let state = start()
    const before = state
    state = answer(state, 0)
    expect(pinpoint.outcomesBetween(before, state, LOCAL_PLAYER)).toEqual([
      expect.objectContaining({ skill: 'locate', success: true }),
    ])

    state = playThrough(start())
    expect(pinpoint.isFinished(state)).toBe(true)
    const summary = pinpoint.summarize(state, LOCAL_PLAYER)
    expect(summary).toMatchObject({
      mode: 'pinpoint',
      bestKey: 'pinpoint:countries:World:normal',
      score: 10_000,
      maxScore: 10_000,
      endedAt: 95,
    })
    expect(summary.outcomes).toHaveLength(ROUNDS_PER_GAME)
  })

  it('plays capitals and Name It games', () => {
    const capitals = playThrough(start({ ...world, target: 'capitals' }))
    expect(pinpoint.summarize(capitals, LOCAL_PLAYER)).toMatchObject({
      score: 10_000,
      bestKey: 'pinpoint:capitals:World:normal',
    })
    expect(pinpointSkill(capitals.config)).toBe('capital')

    const names = playThrough(start({ ...world, variant: 'name' }))
    expect(pinpoint.summarize(names, LOCAL_PLAYER).score).toBe(10_000)
    expect(names.rounds.challenges.every((c) => c.kind === 'identify' && c.choices === null)).toBe(
      true,
    )
  })

  it('offers multiple choice when naming on easy', () => {
    const state = start({ ...world, variant: 'name', difficulty: 'easy' })
    const challenge = state.rounds.challenges[0]
    expect(challenge.kind === 'identify' && challenge.choices).toHaveLength(4)
  })

  it('times hard rounds and scores a silent player as missed', () => {
    let state = start({ ...world, difficulty: 'hard' })
    expect(pinpoint.deadline(state)).toBe(20_000)
    state = pinpoint.reduce(state, { type: 'tick', at: 20_000 }, geo)
    expect(state.rounds.results[0][LOCAL_PLAYER].kind).toBe('missed')
    expect(pinpoint.deadline(state)).toBeNull()
  })

  it('keys personal bests by the game variant', () => {
    const state = start({
      ...world,
      region: 'Europe',
      difficulty: 'hard',
      skipMicro: true,
      night: true,
      practiceWeak: true,
    })
    expect(pinpoint.summarize(state, LOCAL_PLAYER).bestKey).toBe(
      'pinpoint:countries:Europe:hard:no-micro:night:practice',
    )
  })

  it('scores a pin in the wrong country as a miss with partial points', () => {
    let state = start({ ...world, region: 'South America' })
    state = {
      ...state,
      rounds: { ...state.rounds, challenges: [{ kind: 'locate', countryId: 'PER' }] },
    }
    state = submit(state, { pin: [-68.15, -16.5], at: 1 })
    const result = state.rounds.results[0][LOCAL_PLAYER]
    expect(result).toMatchObject({ kind: 'locate', clickedId: 'BOL', hit: false })
    expect(result.points).toBeGreaterThan(0)
  })
})
