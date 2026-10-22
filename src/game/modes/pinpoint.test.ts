import { describe, expect, it } from 'vitest'
import { loadTestGeoData } from '../../test/loadTestCountries'
import { LOCAL_PLAYER } from '../core/types'
import { pinpoint, ROUNDS_PER_GAME, type PinpointConfig, type PinpointState } from './pinpoint'

const geo = loadTestGeoData()
const world: PinpointConfig = { region: 'World', skipMicro: false, practiceWeak: false }

function start(config = world, seed = 'seed-1'): PinpointState {
  return pinpoint.start({ config, seed, now: 0, geo, players: [LOCAL_PLAYER] })
}

/** Submits a pin on the current target's label point, which is always inside it. */
function findTarget(state: PinpointState, at: number): PinpointState {
  const target = state.rounds.challenges[state.rounds.round].countryId
  const pin = geo.factsOf(target).label
  return pinpoint.reduce(
    state,
    { type: 'submit', playerId: LOCAL_PLAYER, submission: { pin, at } },
    geo,
  )
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

  it('plays through to a perfect summary', () => {
    let state = start()
    for (let round = 0; round < ROUNDS_PER_GAME; round++) {
      const before = state
      state = findTarget(state, round * 10)
      expect(pinpoint.outcomesBetween(before, state, LOCAL_PLAYER)).toEqual([
        expect.objectContaining({ skill: 'locate', success: true }),
      ])
      state = pinpoint.reduce(state, { type: 'next', at: round * 10 + 5 }, geo)
    }

    expect(pinpoint.isFinished(state)).toBe(true)
    const summary = pinpoint.summarize(state, LOCAL_PLAYER)
    expect(summary).toMatchObject({
      mode: 'pinpoint',
      bestKey: 'pinpoint:World',
      score: 10_000,
      maxScore: 10_000,
      endedAt: 95,
    })
    expect(summary.outcomes).toHaveLength(ROUNDS_PER_GAME)
  })

  it('keys personal bests by the game variant', () => {
    const state = start({ region: 'Europe', skipMicro: true, practiceWeak: true })
    expect(pinpoint.summarize(state, LOCAL_PLAYER).bestKey).toBe(
      'pinpoint:Europe:no-micro:practice',
    )
  })

  it('scores a pin in the wrong country as a miss with partial points', () => {
    let state = start({ ...world, region: 'South America' }, 'peru-test')
    // Force a known target to keep the assertion meaningful.
    state = {
      ...state,
      rounds: { ...state.rounds, challenges: [{ kind: 'locate', countryId: 'PER' }] },
    }
    state = pinpoint.reduce(
      state,
      { type: 'submit', playerId: LOCAL_PLAYER, submission: { pin: [-68.15, -16.5], at: 1 } },
      geo,
    )
    const result = state.rounds.results[0][LOCAL_PLAYER]
    expect(result).toMatchObject({ kind: 'locate', clickedId: 'BOL', hit: false })
    expect(result.points).toBeGreaterThan(0)
  })
})
