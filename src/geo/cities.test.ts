import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadTestCities, loadTestGeoData } from '../test/loadTestCountries'
import { cityIdFromKey, cityKey } from './cities'
import { REGIONS } from './countries'

const geo = loadTestGeoData()
const cities = loadTestCities()
const curation = JSON.parse(readFileSync('data/cities.json', 'utf8')) as {
  perCountryCap: number
  include: string[]
  exclude: string[]
}

describe('major cities dataset', () => {
  it('has about 250 unique, clean non-capital cities capped per country', () => {
    expect(cities.all.length).toBeGreaterThanOrEqual(230)
    expect(cities.all.length).toBeLessThanOrEqual(270)

    const ids = new Set<string>()
    const names = new Set<string>()
    const perCountry = new Map<string, number>()

    for (const city of cities.all) {
      expect(city.id).toMatch(/^[a-z]{3}-[a-z0-9-]+$/)
      expect(ids.has(city.id)).toBe(false)
      ids.add(city.id)

      const folded = city.name
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
      expect(names.has(folded)).toBe(false)
      names.add(folded)

      expect(geo.playableIds).toContain(city.countryId)
      const capitals = geo.factsOf(city.countryId).capitals
      expect(capitals.some((c) => c.name.toLowerCase() === city.name.toLowerCase())).toBe(false)

      const [lon, lat] = city.at
      expect(lon).toBeGreaterThanOrEqual(-180)
      expect(lon).toBeLessThanOrEqual(180)
      expect(lat).toBeGreaterThanOrEqual(-90)
      expect(lat).toBeLessThanOrEqual(90)
      expect(city.population).toBeGreaterThan(0)
      expect(city.difficulty).toBeGreaterThanOrEqual(0)
      expect(city.difficulty).toBeLessThanOrEqual(1)

      perCountry.set(city.countryId, (perCountry.get(city.countryId) ?? 0) + 1)
    }

    for (const count of perCountry.values()) {
      expect(count).toBeLessThanOrEqual(curation.perCountryCap)
    }
  })

  it('covers at least 10 cities in every region and applies curated excludes', () => {
    for (const region of REGIONS) {
      expect(cities.inRegion(geo, region).length).toBeGreaterThanOrEqual(10)
    }
    const excluded = new Set(curation.exclude)
    for (const city of cities.all) {
      expect(excluded.has(`${city.countryId}:${city.name}`)).toBe(false)
    }
    expect(cities.get('usa-new-york')).toBeDefined()
    expect(cities.get('ita-venice')).toBeDefined()
    expect(cities.get('aus-sydney')).toBeDefined()
    expect(cities.get('rus-st-petersburg')?.name).toBe('Saint Petersburg')
    expect(cities.byCountry('FRA').length).toBeGreaterThan(0)
  })

  it('round-trips city place keys', () => {
    expect(cityKey('ita-venice')).toBe('city:ita-venice')
    expect(cityIdFromKey('city:ita-venice')).toBe('ita-venice')
    expect(cityIdFromKey('sub:usa-ca')).toBeNull()
  })
})
