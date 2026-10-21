import { describe, expect, it } from 'vitest'
import { loadTestCountries } from '../test/loadTestCountries'
import { evaluateGuess } from './evaluateGuess'
import {
  gameReducer,
  initialGameState,
  type GameConfig,
  type GameState,
  type RoundResult,
} from './gameReducer'
import { practiceWeight, selectTargets, targetPool } from './selectTargets'
import { clearStats, loadStats, recordResult, saveStats, type StatsByCountry } from './stats'
import type { JsonStorage } from './storage'

const countries = loadTestCountries()
const world: GameConfig = { region: 'World', skipMicro: false, practiceWeak: false }

/** Deterministic pseudo-random sequence so tests are repeatable. */
function seededRandom(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32
    return seed / 2 ** 32
  }
}

describe('targetPool', () => {
  it('uses every playable place on the World map', () => {
    expect(targetPool(countries.features, world)).toHaveLength(197)
  })

  it('filters by region and skips micro-states on request', () => {
    const europe = targetPool(countries.features, { ...world, region: 'Europe' })
    expect(europe.every((f) => f.properties.region === 'Europe')).toBe(true)
    expect(europe.some((f) => f.properties.id === 'VAT')).toBe(true)

    const europeNoMicro = targetPool(countries.features, {
      ...world,
      region: 'Europe',
      skipMicro: true,
    })
    expect(europeNoMicro.some((f) => f.properties.isMicro)).toBe(false)
    expect(europeNoMicro.length).toBeLessThan(europe.length)
  })
})

describe('selectTargets', () => {
  const pool = targetPool(countries.features, world)

  it('picks 10 distinct countries from the pool', () => {
    const ids = selectTargets(pool, 10, { random: seededRandom(1) })
    expect(ids).toHaveLength(10)
    expect(new Set(ids).size).toBe(10)
    const poolIds = new Set(pool.map((f) => f.properties.id))
    expect(ids.every((id) => poolIds.has(id))).toBe(true)
  })

  it('returns the whole pool when it is smaller than the count', () => {
    const small = pool.slice(0, 4)
    expect(selectTargets(small, 10, { random: seededRandom(2) }).sort()).toEqual(
      small.map((f) => f.properties.id).sort(),
    )
  })

  it('favours weak countries in practice mode', () => {
    const twoCountries = [countries.get('PER')!, countries.get('BOL')!]
    const stats: StatsByCountry = {
      PER: { attempts: 10, hits: 10, totalKm: 0 },
      BOL: { attempts: 10, hits: 0, totalKm: 5000 },
    }
    const random = seededRandom(3)
    let boliviaFirst = 0
    for (let i = 0; i < 500; i++) {
      if (selectTargets(twoCountries, 1, { stats, random })[0] === 'BOL') boliviaFirst++
    }
    expect(boliviaFirst).toBeGreaterThan(450)
  })

  it('weights unseen countries between strong and weak ones', () => {
    const strong = practiceWeight({ attempts: 5, hits: 5, totalKm: 0 })
    const weak = practiceWeight({ attempts: 5, hits: 0, totalKm: 900 })
    expect(strong).toBeLessThan(practiceWeight(undefined))
    expect(weak).toBeGreaterThan(practiceWeight(undefined))
  })
})

describe('evaluateGuess', () => {
  it('scores a click inside the target as a hit', () => {
    const result = evaluateGuess(countries, 'PER', [-77.04, -12.05], 'World')
    expect(result).toMatchObject({ clickedId: 'PER', distanceKm: 0, points: 1000, hit: true })
  })

  it('reports the country actually clicked on a miss', () => {
    const result = evaluateGuess(countries, 'PER', [-68.15, -16.5], 'World')
    expect(result.clickedId).toBe('BOL')
    expect(result.hit).toBe(false)
    expect(result.points).toBeGreaterThan(900)
  })

  it('reports ocean clicks as null', () => {
    expect(evaluateGuess(countries, 'PER', [-90, -12], 'World').clickedId).toBeNull()
  })

  it('counts a click next to a micro-state as a hit', () => {
    // Central Rome, a few km from Vatican City.
    const result = evaluateGuess(countries, 'VAT', [12.49, 41.89], 'Europe')
    expect(result.clickedId).toBe('ITA')
    expect(result.hit).toBe(true)
  })
})

describe('gameReducer', () => {
  const result = (targetId: string): RoundResult => ({
    targetId,
    guess: [0, 0],
    clickedId: null,
    distanceKm: 100,
    nearest: [1, 1],
    points: 900,
    hit: false,
  })

  it('plays through rounds to the summary', () => {
    let state: GameState = gameReducer(initialGameState, {
      type: 'start',
      config: world,
      targetIds: ['PER', 'BOL'],
    })

    // Confirm is ignored until a pin is placed.
    expect(gameReducer(state, { type: 'confirm', result: result('PER') })).toBe(state)

    for (const id of ['PER', 'BOL']) {
      state = gameReducer(state, { type: 'placePin', point: [1, 2] })
      state = gameReducer(state, { type: 'confirm', result: result(id) })
      // The pin cannot move after the reveal.
      expect(gameReducer(state, { type: 'placePin', point: [3, 4] })).toBe(state)
      state = gameReducer(state, { type: 'next' })
    }

    expect(state.screen).toBe('summary')
    if (state.screen === 'summary') {
      expect(state.results.map((r) => r.targetId)).toEqual(['PER', 'BOL'])
    }
  })

  it('does not skip a round before it is revealed', () => {
    const state = gameReducer(initialGameState, {
      type: 'start',
      config: world,
      targetIds: ['PER', 'BOL'],
    })
    expect(gameReducer(state, { type: 'next' })).toBe(state)
  })
})

describe('stats', () => {
  it('accumulates attempts, hits and distance', () => {
    let stats: StatsByCountry = {}
    stats = recordResult(stats, { ...baseResult(), hit: true, distanceKm: 0 })
    stats = recordResult(stats, { ...baseResult(), hit: false, distanceKm: 250 })
    expect(stats.PER).toEqual({ attempts: 2, hits: 1, totalKm: 250 })
  })

  it('round-trips through storage', () => {
    const storage = memoryStorage()
    saveStats({ PER: { attempts: 1, hits: 1, totalKm: 0 } }, storage)
    expect(loadStats(storage)).toEqual({ PER: { attempts: 1, hits: 1, totalKm: 0 } })
    clearStats(storage)
    expect(loadStats(storage)).toEqual({})
  })

  it('keeps working when storage throws or holds garbage', () => {
    const broken: JsonStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadStats(broken)).toEqual({})
    expect(() => saveStats({}, broken)).not.toThrow()
    expect(() => clearStats(broken)).not.toThrow()

    const garbage = memoryStorage()
    garbage.setItem('world-game:stats:v1', '{not json')
    expect(loadStats(garbage)).toEqual({})
  })
})

function baseResult(): RoundResult {
  return {
    targetId: 'PER',
    guess: [0, 0],
    clickedId: null,
    distanceKm: 0,
    nearest: [0, 0],
    points: 0,
    hit: false,
  }
}

function memoryStorage(): JsonStorage {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}
