import { describe, expect, it } from 'vitest'
import { loadTestGeoData } from '../../test/loadTestCountries'
import type { Category } from '../core/categories'
import { buildCategories } from '../core/categories'
import { LOCAL_PLAYER, type CategoryResult } from '../core/types'
import {
  DEFAULT_RARE_EARTH_CONFIG,
  rareEarth,
  RARE_EARTH_ROUNDS,
  type RareEarthState,
} from './rareEarth'

const geo = loadTestGeoData()
const landlockedAfrica = buildCategories(geo).find((c) => c.id === 'landlocked:Africa')!

function startWith(categories: Category[]): RareEarthState {
  const state = rareEarth.start({
    config: DEFAULT_RARE_EARTH_CONFIG,
    seed: 's',
    now: 0,
    geo,
    players: [LOCAL_PLAYER],
  })
  return {
    ...state,
    rounds: {
      ...state.rounds,
      challenges: categories.map((category) => ({ kind: 'category', category })),
    },
  }
}

function answer(state: RareEarthState, answerId: string, at = 1) {
  const pin = geo.factsOf(answerId).label
  const next = rareEarth.reduce(
    state,
    { type: 'submit', playerId: LOCAL_PLAYER, submission: { answerId, pin, at } },
    geo,
  )
  return { state: next, result: next.rounds.results.at(-1)![LOCAL_PLAYER] as CategoryResult }
}

describe('rareEarth', () => {
  it('picks five varied categories, the same for a seed', () => {
    const start = (seed: string) =>
      rareEarth.start({ config: DEFAULT_RARE_EARTH_CONFIG, seed, now: 0, geo, players: ['p'] })
    const state = start('x')
    const kinds = state.rounds.challenges.map((c) => c.category.kind)
    expect(kinds).toHaveLength(RARE_EARTH_ROUNDS)
    expect(new Set(kinds).size).toBe(RARE_EARTH_ROUNDS)
    expect(start('x').rounds.challenges).toEqual(state.rounds.challenges)
  })

  it('scores rare, well-placed answers highest', () => {
    const state = startWith([landlockedAfrica, landlockedAfrica])
    const common = answer(state, 'ETH').result
    const rare = answer(state, 'LSO').result
    expect(common).toMatchObject({ valid: true, rarityPoints: 100, points: 100 })
    expect(rare.valid).toBe(true)
    expect(rare.points).toBeGreaterThan(900)
  })

  it('keeps a quarter for a valid but misplaced answer', () => {
    const state = startWith([landlockedAfrica])
    const next = rareEarth.reduce(
      state,
      {
        type: 'submit',
        playerId: LOCAL_PLAYER,
        submission: { answerId: 'LSO', pin: [-150, 40], at: 1 },
      },
      geo,
    )
    const result = next.rounds.results[0][LOCAL_PLAYER] as CategoryResult
    expect(result.locatePoints).toBe(0)
    expect(result.points).toBe(Math.round(result.rarityPoints * 0.25))
  })

  it('gives nothing for wrong or repeated answers', () => {
    let state = startWith([landlockedAfrica, landlockedAfrica])
    const wrong = answer(state, 'NGA').result
    expect(wrong).toMatchObject({ valid: false, points: 0, reused: false })

    state = answer(state, 'MLI').state
    state = rareEarth.reduce(state, { type: 'next', at: 2 }, geo)
    const again = answer(state, 'MLI', 3).result
    expect(again).toMatchObject({ valid: false, reused: true, points: 0 })
  })

  it('records named countries as recall outcomes', () => {
    const before = startWith([landlockedAfrica])
    const after = answer(before, 'LSO').state
    expect(rareEarth.outcomesBetween(before, after, LOCAL_PLAYER)).toEqual([
      expect.objectContaining({ countryId: 'LSO', skill: 'recall', success: true }),
    ])
  })
})
