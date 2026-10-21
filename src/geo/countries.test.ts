import { describe, expect, it } from 'vitest'
import { loadTestCountries } from '../test/loadTestCountries'
import type { LonLat } from './coords'

const countries = loadTestCountries()

describe('CountryIndex.countryAt', () => {
  it.each<[string, LonLat, string]>([
    ['Lima', [-77.04, -12.05], 'PER'],
    ['Moscow', [37.62, 55.75], 'RUS'],
    ['Chukotka, east of the antimeridian', [-173, 65.5], 'RUS'],
    ['Viti Levu, Fiji', [178, -17.8], 'FJI'],
    ['Fiji, west of the antimeridian', [-179.95, -16.8], 'FJI'],
    ['Antarctic interior', [0, -85], 'ATA'],
    ['Vatican City', [12.4534, 41.9029], 'VAT'],
    ['Hargeisa (Somaliland is merged into Somalia)', [44.06, 9.56], 'SOM'],
    ['Kyrenia (Northern Cyprus is merged into Cyprus)', [33.32, 35.33], 'CYP'],
    ['Western Sahara', [-13, 24], 'SAH'],
  ])('%s → %s', (_label, point, expectedId) => {
    expect(countries.countryAt(point)?.properties.id).toBe(expectedId)
  })

  it.each<[string, LonLat]>([
    ['mid-Atlantic', [-30, 0]],
    ['mid-Pacific near the antimeridian', [180, 0]],
    ['Arctic Ocean', [0, 89]],
  ])('%s is ocean', (_label, point) => {
    expect(countries.countryAt(point)).toBeNull()
  })
})

describe('country data', () => {
  it('has 197 playable places, all with a region', () => {
    const playable = countries.playable
    expect(playable).toHaveLength(197)
    const regions = new Set(playable.map((f) => f.properties.region))
    expect([...regions].sort()).toEqual([
      'Africa',
      'Asia',
      'Europe',
      'North America',
      'Oceania',
      'South America',
    ])
  })

  it('marks Western Sahara as clickable but not playable', () => {
    const westernSahara = countries.get('SAH')
    expect(westernSahara?.properties.playable).toBe(false)
    expect(westernSahara?.properties.name).toBe('Western Sahara')
  })
})
