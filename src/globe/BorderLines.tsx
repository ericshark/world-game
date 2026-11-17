import { Line } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import type { Vector3 } from 'three'
import { loadBorders, type BorderLinesData } from '../geo/borders'
import { lonLatToVector3 } from './coords3d'

/** Between the lat/lon grid (1.001) and the country paint overlay (1.002). */
const BORDER_RADIUS = 1.0015
/** Longer stretches are split, so a straight border follows the curve of the globe. */
const MAX_STEP_DEG = 1.5
const LINE_WIDTH = 1.25

/**
 * Land borders drawn as thin lines on the globe. They come from the same shapes the game uses
 * for hit-testing, so they match the outlines shown at a reveal. The data loads the first time
 * the lines are switched on.
 */
export function BorderLines({ night = false }: { night?: boolean }) {
  const invalidate = useThree((state) => state.invalidate)
  const [data, setData] = useState<BorderLinesData | null>(null)

  useEffect(() => {
    let cancelled = false
    loadBorders()
      .then((loaded) => {
        if (cancelled) return
        setData(loaded)
        invalidate()
      })
      // Borders are an extra: without them the game still plays.
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [invalidate])

  const points = useMemo(() => (data ? segmentPoints(data) : null), [data])
  if (!points) return null

  return (
    <Line
      segments
      points={points}
      color={night ? '#9fb0ff' : '#ffffff'}
      lineWidth={LINE_WIDTH}
      transparent
      opacity={night ? 0.55 : 0.7}
      depthWrite={false}
      raycast={() => null}
    />
  )
}

/** Start and end of every little segment of every border line, as pairs of points. */
function segmentPoints(lines: BorderLinesData): Vector3[] {
  const points: Vector3[] = []
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const [lon0, lat0] = line[i - 1]
      const [lon1, lat1] = line[i]
      // A jump across the antimeridian would draw a line straight through the globe.
      if (Math.abs(lon1 - lon0) > 180) continue
      const steps = Math.max(
        1,
        Math.ceil(Math.max(Math.abs(lon1 - lon0), Math.abs(lat1 - lat0)) / MAX_STEP_DEG),
      )
      for (let s = 0; s < steps; s++) {
        const a = s / steps
        const b = (s + 1) / steps
        points.push(
          lonLatToVector3([lon0 + (lon1 - lon0) * a, lat0 + (lat1 - lat0) * a], BORDER_RADIUS),
          lonLatToVector3([lon0 + (lon1 - lon0) * b, lat0 + (lat1 - lat0) * b], BORDER_RADIUS),
        )
      }
    }
  }
  return points
}
