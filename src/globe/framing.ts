import { geoBounds, geoDistance, geoInterpolate } from 'd3-geo'
import type { Feature } from 'geojson'
import type { LonLat } from '../geo/coords'
import { MAX_CAMERA_DISTANCE, MIN_CAMERA_DISTANCE } from './constants'

export interface CameraView {
  center: LonLat
  distance: number
}

/** Frames two points together: zooms in when they are close, out when they are far apart. */
export function framePair(a: LonLat, b: LonLat): CameraView {
  const separation = geoDistance(a, b)
  const distance = MIN_CAMERA_DISTANCE + 0.6 + separation * 2.5
  return {
    center: geoInterpolate(a, b)(0.5),
    distance: Math.min(MAX_CAMERA_DISTANCE, Math.max(MIN_CAMERA_DISTANCE, distance)),
  }
}

/** Fully zoomed out over a random spot, so the previous answer gives no hint. */
export function randomOverview(random: () => number = Math.random): CameraView {
  const lon = random() * 360 - 180
  const lat = random() * 100 - 40
  return { center: [lon, lat], distance: MAX_CAMERA_DISTANCE }
}

/** Frames a whole country, centred on a point inside it. */
export function frameCountry(feature: Feature, center: LonLat): CameraView {
  const [[west, south], [east, north]] = geoBounds(feature)
  const lonSpan =
    (east >= west ? east - west : east + 360 - west) * Math.cos((center[1] * Math.PI) / 180)
  const extentRad = (Math.max(lonSpan, north - south) * Math.PI) / 180
  const distance = MIN_CAMERA_DISTANCE + 0.15 + extentRad * 2.4
  return {
    center,
    distance: Math.min(MAX_CAMERA_DISTANCE, Math.max(MIN_CAMERA_DISTANCE, distance)),
  }
}

/** Frames a set of points, such as every valid answer to a question. */
export function frameMany(points: LonLat[]): CameraView {
  const vectors = points.map(([lon, lat]) => {
    const [l, p] = [(lon * Math.PI) / 180, (lat * Math.PI) / 180]
    return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)]
  })
  const sum = vectors.reduce((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]], [0, 0, 0])
  const length = Math.hypot(...sum)
  if (length < 1e-6) return { center: points[0] ?? [0, 0], distance: MAX_CAMERA_DISTANCE }
  const center: LonLat = [
    (Math.atan2(sum[1], sum[0]) * 180) / Math.PI,
    (Math.asin(sum[2] / length) * 180) / Math.PI,
  ]
  const spread = Math.max(...points.map((point) => geoDistance(center, point)))
  const distance = MIN_CAMERA_DISTANCE + 0.3 + spread * 2.2
  return {
    center,
    distance: Math.min(MAX_CAMERA_DISTANCE, Math.max(MIN_CAMERA_DISTANCE, distance)),
  }
}
