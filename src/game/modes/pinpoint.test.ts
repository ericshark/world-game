import { describe, expect, it } from 'vitest'
import {
  loadTestCities,
  loadTestGeoData,
  loadTestSubdivisionPack,
} from '../../test/loadTestCountries'
import { LOCAL_PLAYER, type Submission } from '../core/types'
import { emptyProfile } from '../profile/profile'
import { recordOutcomes } from '../profile/record'
import {
  DEFAULT_PINPOINT_CONFIG,
  pinpoint,
  pinpointSkill,
  ROUNDS_PER_GAME,
  type PinpointConfig,
  type PinpointState,
} from './pinpoint'

const geo = loadTestGeoData()
const cities = loadTestCities()
const usa = loadTestSubdivisionPack('USA')
const aus = loadTestSubdivisionPack('AUS')
const subdivisions = { USA: usa, AUS: aus }
const world = DEFAULT_PINPOINT_CONFIG

function start(config: PinpointConfig = world, seed = 'seed-1'): PinpointState {
  return pinpoint.start({
    config,
    seed,
    now: 0,
    geo,
    cities,
    subdivisions,
    players: [LOCAL_PLAYER],
  })
}

function submit(state: PinpointState, submission: Submission): PinpointState {
  return pinpoint.reduce(
    state,
    { type: 'submit', playerId: LOCAL_PLAYER, submission },
    geo,
    subdivisions,
  )
}

/** A perfect answer for whatever the current challenge is. */
function answer(state: PinpointState, at: number): PinpointState {
  const challenge = state.rounds.challenges[state.rounds.round]
  switch (challenge.kind) {
    case 'locate': {
      const pack = challenge.packId ? subdivisions[challenge.packId as 'USA' | 'AUS'] : undefined
      return submit(state, { pin: (pack ?? geo).factsOf(challenge.countryId).label, at })
    }
    case 'capital':
      return submit(state, { pin: geo.factsOf(challenge.countryId).capitals[0].at, at })
    case 'city':
      return submit(state, { pin: challenge.at, at })
    case 'identify':
      return submit(state, { answerId: challenge.countryId, at })
  }
}

function playThrough(state: PinpointState): PinpointState {
  for (let round = 0; round < state.rounds.challenges.length; round++) {
    state = answer(state, round * 10)
    state = pinpoint.reduce(state, { type: 'next', at: round * 10 + 5 }, geo, subdivisions)
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

describe('pinpoint flags', () => {
  const flags = { ...world, target: 'flags' as const }

  it('shows a flag to find on the globe, and trains the flag skill', () => {
    const state = start(flags)
    expect(state.rounds.challenges.every((c) => c.kind === 'locate' && c.show === 'flag')).toBe(
      true,
    )
    const before = state
    const after = answer(state, 0)
    expect(pinpoint.outcomesBetween(before, after, LOCAL_PLAYER)).toEqual([
      expect.objectContaining({ skill: 'flag', success: true }),
    ])
    expect(pinpoint.summarize(playThrough(start(flags)), LOCAL_PLAYER)).toMatchObject({
      score: 10_000,
      bestKey: 'pinpoint:flags:World:normal',
    })
    expect(pinpointSkill(flags)).toBe('flag')
  })

  it('offers four flags to pick from on every difficulty, with a separate best', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const state = start({ ...flags, variant: 'name', difficulty })
      for (const challenge of state.rounds.challenges) {
        expect(challenge).toMatchObject({ kind: 'identify', show: 'flag' })
        if (challenge.kind === 'identify') {
          expect(challenge.choices).toHaveLength(4)
          expect(challenge.choices).toContain(challenge.countryId)
        }
      }
    }
    const picked = playThrough(start({ ...flags, variant: 'name' }))
    expect(pinpoint.summarize(picked, LOCAL_PLAYER)).toMatchObject({
      score: 10_000,
      bestKey: 'pinpoint:flags-pick:World:normal',
    })
    expect(pinpoint.summarize(picked, LOCAL_PLAYER).outcomes[0].skill).toBe('flag')
  })

  it('leaves plain countries games exactly as they were', () => {
    const challenge = start().rounds.challenges[0]
    expect(challenge).toEqual({ kind: 'locate', countryId: challenge.countryId })
  })
})

describe('pinpoint cities', () => {
  const config: PinpointConfig = { ...world, target: 'cities', region: 'Europe' }

  it('picks 10 distinct non-capital cities, scores like capitals, and records into profile.places', () => {
    const state = start(config)
    expect(state.rounds.challenges).toHaveLength(ROUNDS_PER_GAME)
    const cityIds = state.rounds.challenges.map((c) => (c.kind === 'city' ? c.cityId : ''))
    expect(new Set(cityIds).size).toBe(ROUNDS_PER_GAME)
    for (const c of state.rounds.challenges) {
      expect(c.kind).toBe('city')
      if (c.kind === 'city') {
        expect(geo.feature(c.countryId).properties.region).toBe('Europe')
      }
    }
    expect(pinpointSkill(config)).toBe('city')

    const finished = playThrough(state)
    const summary = pinpoint.summarize(finished, LOCAL_PLAYER)
    expect(summary.score).toBe(10_000)
    expect(summary.bestKey).toBe('pinpoint:cities:Europe:normal')
    expect(
      summary.outcomes.every((o) => o.skill === 'city' && o.placeKey?.startsWith('city:')),
    ).toBe(true)

    const profile = recordOutcomes(emptyProfile(), summary.outcomes, 100)
    expect(Object.keys(profile.countries)).toHaveLength(0)
    expect(Object.keys(profile.places)).toHaveLength(ROUNDS_PER_GAME)
  })

  it('respects difficulty and omits no-micro from city best keys', () => {
    const easy = start({ ...config, region: 'World', difficulty: 'easy' })
    for (const c of easy.rounds.challenges) {
      if (c.kind === 'city') {
        expect(cities.get(c.cityId)!.difficulty).toBeLessThanOrEqual(0.55)
      }
    }
    const hard = start({ ...config, difficulty: 'hard', skipMicro: true, night: true })
    expect(pinpoint.deadline(hard)).toBe(20_000)
    expect(pinpoint.summarize(hard, LOCAL_PLAYER).bestKey).toBe('pinpoint:cities:Europe:hard:night')
  })
})

describe('pinpoint states & provinces', () => {
  const config: PinpointConfig = { ...world, target: 'subdivisions', subPack: 'USA' }

  it('plays Find it and Name it on a subdivision pack and records into profile.places', () => {
    const state = start(config)
    expect(state.rounds.challenges).toHaveLength(ROUNDS_PER_GAME)
    for (const c of state.rounds.challenges) {
      expect(c).toMatchObject({ kind: 'locate', packId: 'USA' })
    }

    const finished = playThrough(state)
    const summary = pinpoint.summarize(finished, LOCAL_PLAYER)
    expect(summary.score).toBe(10_000)
    expect(summary.bestKey).toBe('pinpoint:sub:USA:normal')
    expect(
      summary.outcomes.every((o) => o.countryId === 'USA' && o.placeKey?.startsWith('sub:usa:us-')),
    ).toBe(true)

    const profile = recordOutcomes(emptyProfile(), summary.outcomes, 100)
    expect(Object.keys(profile.countries)).toHaveLength(0)
    expect(Object.keys(profile.places)).toHaveLength(ROUNDS_PER_GAME)

    // Name it on a pack with fewer than 10 units uses the whole pool (Australia has 8).
    const ausName = playThrough(
      start({ ...config, subPack: 'AUS', variant: 'name', difficulty: 'easy' }),
    )
    expect(ausName.rounds.challenges).toHaveLength(8)
    for (const c of ausName.rounds.challenges) {
      expect(c.kind === 'identify' && c.choices).toHaveLength(4)
    }
    expect(pinpoint.summarize(ausName, LOCAL_PLAYER)).toMatchObject({
      score: 8000,
      maxScore: 8000,
      bestKey: 'pinpoint:sub-name:AUS:easy',
    })
  })
})
