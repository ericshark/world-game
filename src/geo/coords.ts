import { Vector3 } from 'three'

export type LonLat = [lon: number, lat: number]

const DEG = Math.PI / 180

// These match three.js SphereGeometry's vertex layout, so an equirectangular texture
// (u = 0 at lon -180°, v = 0 at the north pole) lines up with real coordinates.
// Result: lon 0° faces +x, lon 90°E faces -z, and the north pole is +y.
export function lonLatToVector3([lon, lat]: LonLat, radius = 1, target = new Vector3()): Vector3 {
  const phi = (lon + 180) * DEG
  const theta = (90 - lat) * DEG
  return target.set(
    -radius * Math.cos(phi) * Math.sin(theta),
    radius * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta),
  )
}

export function vector3ToLonLat(point: Vector3): LonLat {
  const radius = point.length()
  const lat = 90 - Math.acos(Math.min(1, Math.max(-1, point.y / radius))) / DEG
  const lon = Math.atan2(point.z, -point.x) / DEG - 180
  return [normalizeLon(lon), lat]
}

export function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180
}
