import { describe, expect, it } from 'vitest'
import { loadTestGeoData } from '../../test/loadTestCountries'
import type { StatsByCountry } from '../profile/stats'
import { createRandom } from './random'
import {
  nameChoices,
  pickWeighted,
  practiceWeight,
  targetPool,
  weightByDifficulty,
  weightByPractice,
} from './targets'

const geo = loadTestGeoData()
const world = { region: 'World' as const, skipMicro: false }
const ids = (region: 'World' | 'Europe' | 'Oceania' = 'World') =>
  targetPool(geo.countries.features, { region, skipMicro: false }).map((f) => f.properties.id)

describe('targetPool', () => {
  it('uses every playable place on the World map', () => {
    expect(targetPool(geo.countries.features, world)).toHaveLength(197)
  })

  it('filters by region and skips micro-states on request', () => {
    const europe = targetPool(geo.countries.features, { ...world, region: 'Europe' })
    expect(europe.every((f) => f.properties.region === 'Europe')).toBe(true)
    expect(europe.some((f) => f.properties.id === 'VAT')).toBe(true)

    const europeNoMicro = targetPool(geo.countries.features, { region: 'Europe', skipMicro: true })
    expect(europeNoMicro.some((f) => f.properties.isMicro)).toBe(false)
    expect(europeNoMicro.length).toBeLessThan(europe.length)
  })
})

describe('pickWeighted', () => {
  const entries = ids().map((id) => ({ id, weight: 1 }))

  it('picks distinct ids, repeatably for a seed', () => {
    const picked = pickWeighted(entries, 10, createRandom('1'))
    expect(new Set(picked).size).toBe(10)
    expect(pickWeighted(entries, 10, createRandom('1'))).toEqual(picked)
  })

  it('returns everything when asked for more than there is', () => {
    expect(pickWeighted(entries.slice(0, 4), 10, createRandom('2'))).toHaveLength(4)
  })
})

describe('weightByDifficulty', () => {
  it('keeps the better-known half on easy, with a floor for small regions', () => {
    const easy = weightByDifficulty(ids(), 'easy', geo).map((e) => e.id)
    expect(easy).toHaveLength(Math.ceil(197 / 2))
    expect(easy).toContain('BRA')
    expect(easy).not.toContain('TUV')
    expect(weightByDifficulty(ids('Oceania'), 'easy', geo)).toHaveLength(12)
  })

  it('favours obscure countries on hard', () => {
    const hard = new Map(weightByDifficulty(ids(), 'hard', geo).map((e) => [e.id, e.weight]))
    expect(hard.get('TUV')!).toBeGreaterThan(3 * hard.get('BRA')!)
  })
})

describe('practice', () => {
  it('favours weak countries', () => {
    const stats: StatsByCountry = {
      PER: { attempts: 10, hits: 10, totalKm: 0, recent: [] },
      BOL: { attempts: 10, hits: 0, totalKm: 5000, recent: [] },
    }
    const entries = weightByPractice(
      [
        { id: 'PER', weight: 1 },
        { id: 'BOL', weight: 1 },
      ],
      stats,
    )
    const random = createRandom('3')
    let boliviaFirst = 0
    for (let i = 0; i < 500; i++) if (pickWeighted(entries, 1, random)[0] === 'BOL') boliviaFirst++
    expect(boliviaFirst).toBeGreaterThan(450)
  })

  it('weights unseen countries between strong and weak ones', () => {
    const strong = practiceWeight({ attempts: 5, hits: 5, totalKm: 0, recent: [] })
    const weak = practiceWeight({ attempts: 5, hits: 0, totalKm: 900, recent: [] })
    expect(strong).toBeLessThan(practiceWeight(undefined))
    expect(weak).toBeGreaterThan(practiceWeight(undefined))
  })
})

describe('nameChoices', () => {
  it('offers the answer among plausible, distinct decoys', () => {
    const choices = nameChoices(geo, 'PER', createRandom('x'))
    expect(choices).toHaveLength(4)
    expect(new Set(choices).size).toBe(4)
    expect(choices).toContain('PER')
    const southAmerican = choices.filter(
      (id) => geo.feature(id).properties.region === 'South America',
    )
    expect(southAmerican).toHaveLength(4)
  })

  it('works for isolated island nations', () => {
    expect(nameChoices(geo, 'NRU', createRandom('y'))).toHaveLength(4)
  })
})
