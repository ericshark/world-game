import { geoDistance } from 'd3-geo'
import { describe, expect, it } from 'vitest'
import { loadTestCountries } from '../test/loadTestCountries'
import type { LonLat } from './coords'
import type { CountryFeature } from './countries'
import { EARTH_RADIUS_KM, nearestPointOnCountry } from './distance'

const countries = loadTestCountries()
const peru = countries.get('PER')!

describe('nearestPointOnCountry', () => {
  it('is 0 inside the country', () => {
    const lima: LonLat = [-77.04, -12.05]
    expect(nearestPointOnCountry(lima, peru)).toEqual({ distanceKm: 0, nearest: lima })
  })

  it('measures from La Paz to the Peru border (~85 km)', () => {
    const laPaz: LonLat = [-68.15, -16.5]
    const { distanceKm, nearest } = nearestPointOnCountry(laPaz, peru)
    expect(distanceKm).toBeGreaterThan(50)
    expect(distanceKm).toBeLessThan(150)
    expect(geoDistance(laPaz, nearest) * EARTH_RADIUS_KM).toBeCloseTo(distanceKm, 6)
  })

  it('agrees with a brute-force search over vertices', () => {
    const point: LonLat = [-90, -12]
    const { distanceKm } = nearestPointOnCountry(point, peru)
    const { geometry } = peru
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
    const vertices = polygons.flat(2) as LonLat[]
    const nearestVertexKm = Math.min(
      ...vertices.map((vertex) => geoDistance(point, vertex) * EARTH_RADIUS_KM),
    )
    // Edges can only be closer than their vertices, and with dense coastlines only slightly.
    expect(distanceKm).toBeLessThanOrEqual(nearestVertexKm + 1e-6)
    expect(distanceKm).toBeGreaterThan(nearestVertexKm - 20)
  })

  it('finds the nearest point in the middle of an edge, not just at vertices', () => {
    // A 10°x10° square, wound clockwise as d3-geo expects.
    const square: CountryFeature = {
      type: 'Feature',
      properties: {
        id: 'SQ',
        name: 'Square',
        playable: true,
        status: null,
        region: 'Africa',
        isMicro: false,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [0, 10],
            [10, 10],
            [10, 0],
            [0, 0],
          ],
        ],
      },
    }
    const { distanceKm, nearest } = nearestPointOnCountry([5, 15], square)
    expect(nearest[0]).toBeCloseTo(5, 6)
    // The great-circle edge bulges slightly north of 10° at its midpoint.
    expect(nearest[1]).toBeGreaterThan(10)
    expect(nearest[1]).toBeLessThan(10.2)
    expect(distanceKm).toBeGreaterThan(530)
    expect(distanceKm).toBeLessThan(556)
  })

  it('handles the antimeridian (Chukotka from the Bering Strait side)', () => {
    const russia = countries.get('RUS')!
    const { distanceKm } = nearestPointOnCountry([-170, 64], russia)
    expect(distanceKm).toBeLessThan(150)
  })
})
