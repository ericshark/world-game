import { describe, expect, it } from 'vitest'
import { SphereGeometry, Vector3 } from 'three'
import type { LonLat } from '../geo/coords'
import { lonLatToVector3, vector3ToLonLat } from './coords3d'

describe('lonLatToVector3 / vector3ToLonLat', () => {
  it.each<LonLat>([
    [0, 0],
    [-77.04, -12.05],
    [139.69, 35.68],
    [179.9, -16.5],
    [-179.9, 65],
    [10, 89.5],
  ])('round-trips (%d, %d)', (lon, lat) => {
    const [roundTripLon, roundTripLat] = vector3ToLonLat(lonLatToVector3([lon, lat]))
    expect(roundTripLon).toBeCloseTo(lon, 9)
    expect(roundTripLat).toBeCloseTo(lat, 9)
  })

  it('puts (0°, 0°) on +x and the north pole on +y', () => {
    expect(lonLatToVector3([0, 0]).distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-9)
    expect(lonLatToVector3([0, 90]).distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-9)
  })

  // The texture lines up with geography only if our mapping matches SphereGeometry's UVs:
  // u = (lon + 180) / 360 and v = (lat + 90) / 180 at every vertex.
  it('matches SphereGeometry UV mapping', () => {
    const geometry = new SphereGeometry(1, 16, 12)
    const position = geometry.getAttribute('position')
    const uv = geometry.getAttribute('uv')
    const vertex = new Vector3()
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i)
      const lon = uv.getX(i) * 360 - 180
      const lat = uv.getY(i) * 180 - 90
      if (Math.abs(lat) > 89.99) continue // longitude is undefined at the poles
      expect(lonLatToVector3([lon, lat]).distanceTo(vertex)).toBeLessThan(1e-6)
    }
  })
})
