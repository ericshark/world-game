import { describe, expect, it } from 'vitest'
import { loadTestGeoData } from '../../test/loadTestCountries'
import { LOCAL_PLAYER } from '../core/types'
import {
  DEFAULT_MYSTERY_CONFIG,
  HINT_AFTER,
  mystery,
  mysteryPool,
  mysteryScore,
  type MysteryState,
} from './mystery'

const geo = loadTestGeoData()

function startWith(targetId: string): MysteryState {
  const state = mystery.start({
    config: DEFAULT_MYSTERY_CONFIG,
    seed: 'm',
    now: 0,
    geo,
    players: [LOCAL_PLAYER],
  })
  return { ...state, targetId }
}

const guess = (state: MysteryState, answerId: string, at = 1) =>
  mystery.reduce(
    state,
    { type: 'submit', playerId: LOCAL_PLAYER, submission: { answerId, at } },
    geo,
  )

describe('mystery', () => {
  it('draws a repeatable target, without micro-states on normal', () => {
    const start = (seed: string) =>
      mystery.start({ config: DEFAULT_MYSTERY_CONFIG, seed, now: 0, geo, players: ['p'] })
    expect(start('a').targetId).toBe(start('a').targetId)
    expect(
      mysteryPool(geo, DEFAULT_MYSTERY_CONFIG).some((id) => geo.feature(id).properties.isMicro),
    ).toBe(false)
  })

  it('tells how far and which way each guess is', () => {
    const state = guess(startWith('PER'), 'BRA')
    expect(state.guesses[0]).toMatchObject({ countryId: 'BRA', distanceKm: 0 })
    const far = guess(state, 'JPN')
    expect(far.guesses[1].distanceKm).toBeGreaterThan(10_000)
    const north = guess(startWith('PER'), 'CHL')
    expect(north.guesses[0].bearing > 270 || north.guesses[0].bearing < 90).toBe(true)
  })

  it('accepts a pin on the globe as a guess, ignoring oceans and repeats', () => {
    let state = startWith('PER')
    const pin = (p: [number, number]) =>
      mystery.reduce(
        state,
        { type: 'submit', playerId: LOCAL_PLAYER, submission: { pin: p, at: 1 } },
        geo,
      )
    expect(pin([-30, 0])).toBe(state)
    state = pin([-68.15, -16.5])
    expect(state.guesses.map((g) => g.countryId)).toEqual(['BOL'])
    expect(guess(state, 'BOL')).toBe(state)
  })

  it('ends when found and scores by guesses used', () => {
    let state = guess(startWith('PER'), 'BRA')
    state = guess(state, 'PER', 9)
    expect(mystery.isFinished(state)).toBe(true)
    expect(mysteryScore(state)).toBe(900)
    expect(mystery.summarize(state, LOCAL_PLAYER)).toMatchObject({ score: 900, endedAt: 9 })
  })

  it('offers the continent hint after six guesses, for two guesses', () => {
    let state = startWith('PER')
    const hint = (s: MysteryState) =>
      mystery.reduce(s, { type: 'hint', playerId: LOCAL_PLAYER, at: 1 }, geo)
    expect(hint(state)).toBe(state)
    for (const id of ['JPN', 'FRA', 'EGY', 'IND', 'AUS', 'CAN'].slice(0, HINT_AFTER))
      state = guess(state, id)
    state = hint(state)
    expect(state.hintUsed).toBe(true)
    state = guess(state, 'PER')
    expect(mysteryScore(state)).toBe(1000 - 100 * (7 + 2 - 1))
  })

  it('scores nothing for giving up and records a miss', () => {
    const before = startWith('PER')
    const state = mystery.reduce(before, { type: 'giveUp', playerId: LOCAL_PLAYER, at: 3 }, geo)
    expect(mystery.isFinished(state)).toBe(true)
    expect(mysteryScore(state)).toBe(0)
    expect(mystery.outcomesBetween(before, state, LOCAL_PLAYER)).toEqual([
      expect.objectContaining({ countryId: 'PER', success: false }),
    ])
  })
})

describe('mystery view', () => {
  const start = () =>
    mystery.start({
      config: DEFAULT_MYSTERY_CONFIG,
      seed: 'secret',
      now: 0,
      geo,
      players: [LOCAL_PLAYER],
    })

  it('hides the seed and the country until the game is over', () => {
    const state = start()
    const open = mystery.viewFor!(state, LOCAL_PLAYER)
    expect(open.seed).toBe('')
    expect(open.targetId).toBe('')
    const over = mystery.reduce(state, { type: 'giveUp', playerId: LOCAL_PLAYER, at: 1 }, geo)
    expect(mystery.viewFor!(over, LOCAL_PLAYER).targetId).toBe(state.targetId)
  })

  it('still shows the continent hint without the country', () => {
    let state = start()
    const others = geo.playableIds.filter((id) => id !== state.targetId).slice(0, HINT_AFTER)
    for (const answerId of others) {
      state = mystery.reduce(
        state,
        { type: 'submit', playerId: LOCAL_PLAYER, submission: { answerId, at: 1 } },
        geo,
      )
    }
    state = mystery.reduce(state, { type: 'hint', playerId: LOCAL_PLAYER, at: 2 }, geo)
    const view = mystery.viewFor!(state, LOCAL_PLAYER)
    expect(view.targetId).toBe('')
    expect(view.hintRegion).toBe(geo.feature(state.targetId).properties.region)
  })
})
