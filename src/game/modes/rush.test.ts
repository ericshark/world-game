import { describe, expect, it } from 'vitest'
import { loadTestGeoData } from '../../test/loadTestCountries'
import { LOCAL_PLAYER } from '../core/types'
import {
  DEFAULT_RUSH_CONFIG,
  rush,
  RUSH_MAX_BANK_MS,
  RUSH_START_MS,
  rushMultiplier,
  type RushConfig,
  type RushState,
} from './rush'

const geo = loadTestGeoData()
const start = (config: RushConfig = DEFAULT_RUSH_CONFIG, seed = 'rush-1') =>
  rush.start({ config, seed, now: 0, geo, players: [LOCAL_PLAYER] })

const pinAt = (state: RushState, pin: [number, number], at: number) =>
  rush.reduce(state, { type: 'submit', playerId: LOCAL_PLAYER, submission: { pin, at } }, geo)
const hit = (state: RushState, at: number) => pinAt(state, geo.factsOf(state.current!).label, at)

describe('rush', () => {
  it('starts with a 60 second clock and an easy target', () => {
    const state = start()
    expect(state.clockEndsAt).toBe(RUSH_START_MS)
    expect(geo.difficultyTier(state.current!)).toBeLessThanOrEqual(2)
    expect(start().current).toBe(state.current)
  })

  it('rewards hits with time, points and a growing multiplier', () => {
    let state = start()
    for (let i = 1; i <= 6; i++) state = hit(state, i * 100)
    expect(state.answers.map((a) => a.multiplier)).toEqual([1, 1, 2, 2, 2, 3])
    expect(state.score).toBe(100 + 100 + 200 + 200 + 200 + 300)
    expect(state.clockEndsAt).toBe(RUSH_START_MS + 6 * 2000)
    expect(state.streak).toBe(6)
  })

  it('costs time for misses and skips, and resets the streak', () => {
    let state = hit(start(), 100)
    state = pinAt(state, [-150, -40], 200) // mid-Pacific
    expect(state.answers[1]).toMatchObject({ outcome: 'miss', points: 0, timeDeltaMs: -3000 })
    expect(state.streak).toBe(0)
    state = rush.reduce(state, { type: 'skip', playerId: LOCAL_PLAYER, at: 300 }, geo)
    expect(state.clockEndsAt).toBe(RUSH_START_MS + 2000 - 3000 - 2000)
  })

  it('caps the banked time', () => {
    let state = start()
    for (let i = 1; i <= 30; i++) state = hit(state, 100)
    expect(state.clockEndsAt).toBe(100 + RUSH_MAX_BANK_MS)
  })

  it('gets harder as you score', () => {
    let state = start()
    for (let i = 1; i <= 15; i++) state = hit(state, i)
    expect(geo.difficultyTier(state.current!)).toBeGreaterThanOrEqual(3)
  })

  it('ends when the clock runs out and ignores late answers', () => {
    let state = start()
    expect(rush.deadline(state)).toBe(RUSH_START_MS)
    expect(hit(state, RUSH_START_MS)).toBe(state)
    state = rush.reduce(state, { type: 'tick', at: RUSH_START_MS }, geo)
    expect(rush.isFinished(state)).toBe(true)
    expect(rush.summarize(state, LOCAL_PLAYER)).toMatchObject({
      mode: 'rush',
      bestKey: 'rush:World',
    })
  })

  it('ends sudden death on the first miss and has no clock or skips', () => {
    let state = start({ region: 'Europe', suddenDeath: true })
    expect(state.clockEndsAt).toBeNull()
    expect(rush.reduce(state, { type: 'skip', playerId: LOCAL_PLAYER, at: 1 }, geo)).toBe(state)
    state = hit(state, 1)
    state = pinAt(state, [-150, -40], 2)
    expect(rush.isFinished(state)).toBe(true)
    expect(rush.summarize(state, LOCAL_PLAYER).bestKey).toBe('rush:Europe:sudden-death')
  })

  it('records locate outcomes for stats, not skips', () => {
    const before = start()
    const after = rush.reduce(hit(before, 1), { type: 'skip', playerId: LOCAL_PLAYER, at: 2 }, geo)
    expect(rush.outcomesBetween(before, after, LOCAL_PLAYER)).toEqual([
      expect.objectContaining({ skill: 'locate', success: true }),
    ])
  })

  it('has the documented multiplier steps', () => {
    expect([1, 3, 6, 10, 15].map(rushMultiplier)).toEqual([1, 2, 3, 4, 5])
  })

  it('stops the clock while paused', () => {
    let state = rush.reduce(start(), { type: 'pause', at: 10_000 }, geo)
    expect(rush.deadline(state)).toBeNull()
    expect(rush.reduce(state, { type: 'tick', at: 90_000 }, geo).endedAt).toBeNull()
    // No answers while the game is hidden behind the rules.
    expect(hit(state, 11_000)).toBe(state)

    state = rush.reduce(state, { type: 'resume', at: 40_000 }, geo)
    expect(state.clockEndsAt).toBe(RUSH_START_MS + 30_000)
    expect(rush.deadline(state)).toBe(RUSH_START_MS + 30_000)
  })
})
