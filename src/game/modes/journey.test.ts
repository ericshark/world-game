import { describe, expect, it } from 'vitest'
import { loadTestGeoData } from '../../test/loadTestCountries'
import { LOCAL_PLAYER } from '../core/types'
import {
  connectionsFrom,
  journey,
  journeyScore,
  journeyStars,
  QUICK_PAR_RANGE,
  type JourneyConfig,
  type JourneyState,
} from './journey'

const geo = loadTestGeoData()
const start = (config: JourneyConfig, seed = 'j') =>
  journey.start({ config, seed, now: 0, geo, players: [LOCAL_PLAYER] })
const go = (state: JourneyState, answerId: string, at = 1) =>
  journey.reduce(
    state,
    { type: 'submit', playerId: LOCAL_PLAYER, submission: { answerId, at } },
    geo,
  )

describe('journey', () => {
  it('picks a quick journey with a satisfying par, the same for a seed', () => {
    const state = start({ kind: 'quick', region: 'World' })
    expect(state.par).toBeGreaterThanOrEqual(QUICK_PAR_RANGE[0])
    expect(state.par).toBeLessThanOrEqual(QUICK_PAR_RANGE[1])
    expect(start({ kind: 'quick', region: 'World' }).to).toBe(state.to)
  })

  it('finds a journey even in small regions', () => {
    for (const region of ['Europe', 'Africa', 'Asia', 'North America', 'South America'] as const) {
      expect(start({ kind: 'quick', region }).par).toBeGreaterThan(0)
    }
  })

  it('moves across land and sea, and charges missteps', () => {
    let state = start({ kind: 'expedition', expeditionId: 'cape-to-cairo' })
    expect(state).toMatchObject({ from: 'ZAF', to: 'EGY', route: ['ZAF'] })

    state = go(state, 'EGY')
    expect(state.steps.at(-1)).toMatchObject({ kind: 'misstep', reason: 'not-connected', cost: 1 })
    expect(state.route).toEqual(['ZAF'])

    state = go(state, 'MOZ')
    state = go(state, 'MDG') // across the Mozambique Channel
    expect(state.steps.at(-1)).toMatchObject({ kind: 'sea', cost: 2 })
    expect(state.cost).toBe(4)
    // Tapping where you already are is free.
    expect(go(state, 'MDG')).toBe(state)
  })

  it('finishes on arrival with stars and points from steps over par', () => {
    let state = start({ kind: 'expedition', expeditionId: 'cape-to-cairo' })
    for (const id of ['ZWE', 'ZMB', 'TZA', 'KEN', 'ETH', 'SDN', 'EGY']) state = go(state, id)
    expect(journey.isFinished(state)).toBe(true)
    expect(journeyStars(state)).toBe(
      state.cost <= state.par ? 3 : state.cost - state.par <= 2 ? 2 : 1,
    )
    expect(journeyScore(state)).toBe(
      Math.max(100, 1000 - 150 * Math.max(0, state.cost - state.par)),
    )
  })

  it('enforces expedition rules', () => {
    let spice = start({ kind: 'expedition', expeditionId: 'spice-route' })
    spice = go(spice, 'ESP')
    spice = go(spice, 'FRA')
    spice = go(spice, 'DEU')
    spice = go(spice, 'POL')
    const blocked = go(spice, 'BLR')
    expect(blocked.route.at(-1)).toBe('BLR')
    expect(go(go(blocked, 'RUS'), 'RUS').steps.at(-1)).toMatchObject({ reason: 'forbidden' })

    let silk = start({ kind: 'expedition', expeditionId: 'silk-road' })
    // Reaching China without two "-stans" does not finish the expedition.
    silk = go(silk, 'GEO')
    silk = go(silk, 'RUS')
    silk = go(silk, 'CHN')
    expect(journey.isFinished(silk)).toBe(false)
  })

  it('lists the current connections and charges for the hint', () => {
    let state = start({ kind: 'expedition', expeditionId: 'coastal-route' })
    expect(connectionsFrom(state, geo).map((l) => l.to)).toContain('ESP')
    state = journey.reduce(state, { type: 'hint', playerId: LOCAL_PLAYER, at: 1 }, geo)
    expect(state.cost).toBe(1)
  })

  it('gives nothing for giving up', () => {
    const state = journey.reduce(
      start({ kind: 'quick', region: 'Europe' }),
      { type: 'giveUp', playerId: LOCAL_PLAYER, at: 5 },
      geo,
    )
    expect(journey.summarize(state, LOCAL_PLAYER)).toMatchObject({ score: 0, endedAt: 5 })
  })
})
