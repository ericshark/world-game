import { describe, expect, it } from 'vitest'
import { loadTestGeoData } from '../test/loadTestCountries'
import { nearestPointOnCountry } from './distance'

const geo = loadTestGeoData()
const facts = (id: string) => geo.factsOf(id)

describe('country facts', () => {
  it('covers exactly the playable places', () => {
    const playable = geo.countries.playable.map((f) => f.properties.id).sort()
    expect(geo.playableIds).toEqual(playable)
    for (const id of playable) expect(() => geo.factsOf(id)).not.toThrow()
  })

  it('has symmetric neighbours with the expected borders', () => {
    for (const id of geo.playableIds) {
      for (const neighbor of facts(id).neighbors) expect(facts(neighbor).neighbors).toContain(id)
    }
    expect(facts('DEU').neighbors).toHaveLength(9)
    expect(facts('CHN').neighbors).toHaveLength(14)
    expect(facts('RUS').neighbors).toHaveLength(14)
    expect(facts('ITA').neighbors).toEqual(expect.arrayContaining(['SMR', 'VAT']))
    // French Guiana is part of France.
    expect(facts('BRA').neighbors).toContain('FRA')
    // Ceuta and Melilla.
    expect(facts('ESP').neighbors).toContain('MAR')
    // Western Sahara is not playable, so Morocco and Mauritania do not touch.
    expect(facts('MAR').neighbors).not.toContain('MRT')
    expect(facts('JPN').neighbors).toEqual([])
    expect(facts('GBR').neighbors).toEqual(['IRL'])
  })

  it('lists the 45 landlocked countries, whose only coasts are on the Caspian', () => {
    const landlocked = geo.playableIds.filter((id) => facts(id).landlocked)
    expect(landlocked).toHaveLength(45)
    for (const id of landlocked) {
      expect(facts(id).coasts.every((water) => water === 'Caspian Sea')).toBe(true)
    }
  })

  it('gives island nations no land borders, except on shared islands', () => {
    const sharedIslands = ['DOM', 'GBR', 'HTI', 'IDN', 'IRL', 'PNG', 'TLS']
    for (const id of geo.playableIds.filter((id) => facts(id).island)) {
      if (!sharedIslands.includes(id)) expect(facts(id).neighbors).toEqual([])
    }
  })

  it('puts every capital within its country', () => {
    for (const id of geo.playableIds) {
      for (const capital of facts(id).capitals) {
        const { distanceKm } = nearestPointOnCountry(capital.at, geo.feature(id))
        expect(distanceKm, `${capital.name}, ${id}`).toBeLessThan(25)
      }
    }
  })

  it('puts every label point within its country', () => {
    for (const id of geo.playableIds) {
      const { distanceKm } = nearestPointOnCountry(facts(id).label, geo.feature(id))
      expect(distanceKm, id).toBeLessThan(25)
    }
  })

  it('places countries in the right hemispheres', () => {
    expect(facts('ECU').onEquator).toBe(true)
    expect(facts('PER')).toMatchObject({ landNorth: false, landSouth: true, onEquator: false })
    // Réunion is in the southern hemisphere, but France does not straddle the equator.
    expect(facts('FRA')).toMatchObject({ landNorth: true, landSouth: true, onEquator: false })
  })

  it('has plausible populations and areas', () => {
    expect(facts('CHN').population).toBeGreaterThan(1e9)
    expect(facts('VAT').areaKm2).toBeLessThan(1)
    expect(facts('RUS').areaKm2).toBeGreaterThan(16e6)
    // Somaliland's population is merged into Somalia's.
    expect(facts('SOM').population).toBeGreaterThan(14e6)
  })
})

describe('GeoData.borderDistanceKm', () => {
  it('is symmetric and 0 for neighbours', () => {
    expect(geo.borderDistanceKm('DEU', 'FRA')).toBe(0)
    expect(geo.borderDistanceKm('ESP', 'MAR')).toBe(0)
    expect(geo.borderDistanceKm('PER', 'PER')).toBe(0)
    expect(geo.borderDistanceKm('GBR', 'FRA')).toBe(geo.borderDistanceKm('FRA', 'GBR'))
  })

  it('measures across water and oceans', () => {
    expect(geo.borderDistanceKm('GBR', 'FRA')).toBeGreaterThan(20)
    expect(geo.borderDistanceKm('GBR', 'FRA')).toBeLessThan(50)
    expect(geo.borderDistanceKm('AUS', 'NZL')).toBeGreaterThan(1300)
    expect(geo.borderDistanceKm('AUS', 'NZL')).toBeLessThan(1700)
    expect(geo.borderDistanceKm('PER', 'CHN')).toBeGreaterThan(12000)
  })
})

describe('difficulty tiers', () => {
  it('puts famous countries first and tiny remote ones last', () => {
    for (const id of ['USA', 'BRA', 'CHN', 'IND', 'RUS', 'AUS'])
      expect(geo.difficultyTier(id)).toBe(1)
    for (const id of ['TUV', 'NRU', 'KIR', 'COM', 'STP']) expect(geo.difficultyTier(id)).toBe(5)
  })

  it('ranks familiarity sensibly', () => {
    expect(geo.familiarity('FRA')).toBeGreaterThan(geo.familiarity('BEN'))
    expect(geo.familiarity('VAT')).toBeGreaterThan(geo.familiarity('NRU'))
    expect(geo.familiarity('JPN')).toBeGreaterThan(geo.familiarity('TKM'))
  })
})
