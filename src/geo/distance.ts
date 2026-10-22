import { geoContains } from 'd3-geo'
import type { LonLat } from './coords'
import type { CountryFeature } from './countries'

export const EARTH_RADIUS_KM = 6371

type Vec3 = [number, number, number]

const DEG = Math.PI / 180

export interface NearestPoint {
  distanceKm: number
  /** Closest point on the country; the guess itself when it is inside. */
  nearest: LonLat
}

/** Great-circle distance from a point to the nearest edge of a country (0 when inside). */
export function nearestPointOnCountry(point: LonLat, country: CountryFeature): NearestPoint {
  if (geoContains(country, point)) return { distanceKm: 0, nearest: point }

  const p = toUnit(point)
  let bestAngle = Infinity
  let best: Vec3 = p

  const { geometry } = country
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  for (const polygon of polygons) {
    for (const ring of polygon) {
      let a = toUnit(ring[0] as LonLat)
      for (let i = 1; i < ring.length; i++) {
        const b = toUnit(ring[i] as LonLat)
        const candidate = closestOnArc(p, a, b)
        const angle = angleBetween(p, candidate)
        if (angle < bestAngle) {
          bestAngle = angle
          best = candidate
        }
        a = b
      }
    }
  }

  return { distanceKm: bestAngle * EARTH_RADIUS_KM, nearest: toLonLat(best) }
}

/** Closest point to p on the shorter great-circle arc from a to b (all unit vectors). */
function closestOnArc(p: Vec3, a: Vec3, b: Vec3): Vec3 {
  const n = cross(a, b)
  const nLength = length(n)
  if (nLength < 1e-12) return a

  // Project p onto the arc's great circle, then check it falls between a and b.
  const nUnit = scale(n, 1 / nLength)
  const projected = subtract(p, scale(nUnit, dot(p, nUnit)))
  const projectedLength = length(projected)
  if (projectedLength < 1e-12) return a
  const c = scale(projected, 1 / projectedLength)

  const withinArc = dot(cross(a, c), n) >= 0 && dot(cross(c, b), n) >= 0
  if (withinArc) return c
  return angleBetween(p, a) <= angleBetween(p, b) ? a : b
}

function toUnit([lon, lat]: LonLat): Vec3 {
  const cosLat = Math.cos(lat * DEG)
  return [cosLat * Math.cos(lon * DEG), cosLat * Math.sin(lon * DEG), Math.sin(lat * DEG)]
}

function toLonLat([x, y, z]: Vec3): LonLat {
  return [Math.atan2(y, x) / DEG, Math.atan2(z, Math.hypot(x, y)) / DEG]
}

function angleBetween(u: Vec3, v: Vec3): number {
  return Math.atan2(length(cross(u, v)), dot(u, v))
}

function dot(u: Vec3, v: Vec3): number {
  return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
}

function cross(u: Vec3, v: Vec3): Vec3 {
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
}

function subtract(u: Vec3, v: Vec3): Vec3 {
  return [u[0] - v[0], u[1] - v[1], u[2] - v[2]]
}

function scale(u: Vec3, s: number): Vec3 {
  return [u[0] * s, u[1] * s, u[2] * s]
}

function length(u: Vec3): number {
  return Math.hypot(u[0], u[1], u[2])
}

/** Initial compass bearing (0° = north, clockwise) of the great circle from one point to another. */
export function bearingDegrees([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const φ1 = lat1 * DEG
  const φ2 = lat2 * DEG
  const Δλ = (lon2 - lon1) * DEG
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) / DEG + 360) % 360
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

/** "NE" for 45°. */
export function compassPoint(bearing: number): (typeof COMPASS)[number] {
  return COMPASS[Math.round(bearing / 45) % 8]
}
