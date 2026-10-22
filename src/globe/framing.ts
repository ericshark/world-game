import { geoDistance, geoInterpolate } from 'd3-geo'
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
