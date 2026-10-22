import { describe, expect, it } from 'vitest'
import { loadTestCountries } from '../../test/loadTestCountries'
import { evaluateLocate } from './evaluate'

const countries = loadTestCountries()

describe('evaluateLocate', () => {
  it('scores a click inside the target as a hit', () => {
    const result = evaluateLocate(countries, 'PER', [-77.04, -12.05], 'World')
    expect(result).toMatchObject({ clickedId: 'PER', distanceKm: 0, points: 1000, hit: true })
  })

  it('reports the country actually clicked on a miss', () => {
    const result = evaluateLocate(countries, 'PER', [-68.15, -16.5], 'World')
    expect(result.clickedId).toBe('BOL')
    expect(result.hit).toBe(false)
    expect(result.points).toBeGreaterThan(900)
  })

  it('reports ocean clicks as null', () => {
    expect(evaluateLocate(countries, 'PER', [-90, -12], 'World').clickedId).toBeNull()
  })

  it('counts a click next to a micro-state as a hit', () => {
    // Central Rome, a few km from Vatican City.
    const result = evaluateLocate(countries, 'VAT', [12.49, 41.89], 'Europe')
    expect(result.clickedId).toBe('ITA')
    expect(result.hit).toBe(true)
  })

  it('finds Tarawa in Kiribati', () => {
    const result = evaluateLocate(countries, 'KIR', [172.98, 1.33], 'World')
    expect(result.hit).toBe(true)
  })
})
