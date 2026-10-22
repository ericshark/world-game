import { describe, expect, it } from 'vitest'
import { loadTestGeoData } from '../../test/loadTestCountries'
import {
  evaluateCapital,
  evaluateChallenge,
  evaluateIdentify,
  evaluateLocate,
  NEIGHBOR_POINTS,
} from './evaluate'

const geo = loadTestGeoData()
const world = { region: 'World' as const, cutoffScale: 1 }

describe('evaluateLocate', () => {
  it('scores a click inside the target as a hit', () => {
    const result = evaluateLocate(geo, 'PER', [-77.04, -12.05], world)
    expect(result).toMatchObject({ clickedId: 'PER', distanceKm: 0, points: 1000, hit: true })
  })

  it('reports the country actually clicked on a miss', () => {
    const result = evaluateLocate(geo, 'PER', [-68.15, -16.5], world)
    expect(result.clickedId).toBe('BOL')
    expect(result.hit).toBe(false)
    expect(result.points).toBeGreaterThan(900)
  })

  it('reports ocean clicks as null', () => {
    expect(evaluateLocate(geo, 'PER', [-90, -12], world).clickedId).toBeNull()
  })

  it('counts a click next to a micro-state as a hit', () => {
    // Central Rome, a few km from Vatican City.
    const result = evaluateLocate(geo, 'VAT', [12.49, 41.89], { ...world, region: 'Europe' })
    expect(result.clickedId).toBe('ITA')
    expect(result.hit).toBe(true)
  })

  it('finds Tarawa in Kiribati', () => {
    expect(evaluateLocate(geo, 'KIR', [172.98, 1.33], world).hit).toBe(true)
  })

  it('is stricter on hard', () => {
    const laPaz = [-68.15, -16.5] as [number, number]
    expect(evaluateLocate(geo, 'PER', laPaz, { ...world, cutoffScale: 0.75 }).points).toBeLessThan(
      evaluateLocate(geo, 'PER', laPaz, world).points,
    )
  })
})

describe('evaluateCapital', () => {
  it('hits a capital within the radius', () => {
    const result = evaluateCapital(geo, 'PER', [-77.0, -12.0], world)
    expect(result).toMatchObject({ kind: 'capital', capitalName: 'Lima', hit: true, points: 1000 })
  })

  it('measures to the closest of several capitals', () => {
    // Near La Paz rather than Sucre.
    const result = evaluateCapital(geo, 'BOL', [-68.2, -16.6], world)
    expect(result.capitalName).toBe('La Paz')
    expect(result.hit).toBe(true)
  })

  it('gives partial points for a nearby miss', () => {
    // Cusco is ~570 km from Lima.
    const result = evaluateCapital(geo, 'PER', [-71.97, -13.53], world)
    expect(result.hit).toBe(false)
    expect(result.points).toBeGreaterThan(200)
    expect(result.points).toBeLessThan(600)
    expect(result.clickedId).toBe('PER')
  })
})

describe('evaluateIdentify', () => {
  it('gives full points for the right country and half with a hint', () => {
    expect(evaluateIdentify(geo, 'PER', 'PER', false)).toMatchObject({
      verdict: 'correct',
      points: 1000,
    })
    expect(evaluateIdentify(geo, 'PER', 'PER', true).points).toBe(500)
  })

  it('gives a little for naming a neighbour', () => {
    expect(evaluateIdentify(geo, 'PER', 'BOL', false)).toMatchObject({
      verdict: 'neighbor',
      points: NEIGHBOR_POINTS,
      hit: false,
    })
    expect(evaluateIdentify(geo, 'PER', 'JPN', false)).toMatchObject({
      verdict: 'wrong',
      points: 0,
    })
  })
})

describe('evaluateChallenge', () => {
  it('treats an incomplete submission as missed', () => {
    expect(
      evaluateChallenge(geo, { kind: 'locate', countryId: 'PER' }, { at: 1 }, world).kind,
    ).toBe('missed')
    expect(
      evaluateChallenge(
        geo,
        { kind: 'identify', countryId: 'PER', choices: null },
        undefined,
        world,
      ).kind,
    ).toBe('missed')
  })
})
