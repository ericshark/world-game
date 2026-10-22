import { describe, expect, it } from 'vitest'
import { loadTestCountries } from '../../test/loadTestCountries'
import type { StatsByCountry } from '../profile/stats'
import { createRandom } from './random'
import { practiceWeight, selectTargets, targetPool } from './targets'

const countries = loadTestCountries()
const world = { region: 'World' as const, skipMicro: false }

describe('targetPool', () => {
  it('uses every playable place on the World map', () => {
    expect(targetPool(countries.features, world)).toHaveLength(197)
  })

  it('filters by region and skips micro-states on request', () => {
    const europe = targetPool(countries.features, { ...world, region: 'Europe' })
    expect(europe.every((f) => f.properties.region === 'Europe')).toBe(true)
    expect(europe.some((f) => f.properties.id === 'VAT')).toBe(true)

    const europeNoMicro = targetPool(countries.features, { region: 'Europe', skipMicro: true })
    expect(europeNoMicro.some((f) => f.properties.isMicro)).toBe(false)
    expect(europeNoMicro.length).toBeLessThan(europe.length)
  })
})

describe('selectTargets', () => {
  const pool = targetPool(countries.features, world)

  it('picks 10 distinct countries from the pool', () => {
    const ids = selectTargets(pool, 10, { random: createRandom('1') })
    expect(ids).toHaveLength(10)
    expect(new Set(ids).size).toBe(10)
    const poolIds = new Set(pool.map((f) => f.properties.id))
    expect(ids.every((id) => poolIds.has(id))).toBe(true)
  })

  it('is repeatable for the same seed', () => {
    expect(selectTargets(pool, 10, { random: createRandom('same') })).toEqual(
      selectTargets(pool, 10, { random: createRandom('same') }),
    )
  })

  it('returns the whole pool when it is smaller than the count', () => {
    const small = pool.slice(0, 4)
    expect(selectTargets(small, 10, { random: createRandom('2') }).sort()).toEqual(
      small.map((f) => f.properties.id).sort(),
    )
  })

  it('favours weak countries in practice mode', () => {
    const twoCountries = [countries.get('PER')!, countries.get('BOL')!]
    const stats: StatsByCountry = {
      PER: { attempts: 10, hits: 10, totalKm: 0, recent: [] },
      BOL: { attempts: 10, hits: 0, totalKm: 5000, recent: [] },
    }
    const random = createRandom('3')
    let boliviaFirst = 0
    for (let i = 0; i < 500; i++) {
      if (selectTargets(twoCountries, 1, { stats, random })[0] === 'BOL') boliviaFirst++
    }
    expect(boliviaFirst).toBeGreaterThan(450)
  })

  it('weights unseen countries between strong and weak ones', () => {
    const strong = practiceWeight({ attempts: 5, hits: 5, totalKm: 0, recent: [] })
    const weak = practiceWeight({ attempts: 5, hits: 0, totalKm: 900, recent: [] })
    expect(strong).toBeLessThan(practiceWeight(undefined))
    expect(weak).toBeGreaterThan(practiceWeight(undefined))
  })
})
