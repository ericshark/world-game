import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Quaternion, Vector3 } from 'three'
import type { LonLat } from '../geo/coords'
import { useReducedMotion } from '../ui/motion'
import { lonLatToVector3 } from './coords3d'

const FLIGHT_DURATION_MS = 1100
/** Even with reduced motion the camera glides briefly, so the jump is not disorienting. */
const REDUCED_FLIGHT_DURATION_MS = 250

export interface CameraFocus {
  /** Changes whenever a new flight should start, even to the same place. */
  id: number
  center: LonLat
  distance: number
}

interface Flight {
  from: Vector3
  rotation: Quaternion
  fromDistance: number
  toDistance: number
  startedAt: number
}

/** Flies the camera to look straight down at `focus.center` from `focus.distance`. */
export function CameraRig({ focus }: { focus: CameraFocus | null }) {
  const pending = useRef<CameraFocus | null>(null)
  const flight = useRef<Flight | null>(null)
  const duration = useReducedMotion() ? REDUCED_FLIGHT_DURATION_MS : FLIGHT_DURATION_MS

  useEffect(() => {
    pending.current = focus
  }, [focus])

  useFrame(({ camera, controls }) => {
    const orbit = controls as { enabled: boolean } | null

    if (pending.current) {
      const from = camera.position.clone().normalize()
      const to = lonLatToVector3(pending.current.center).normalize()
      flight.current = {
        from,
        rotation: new Quaternion().setFromUnitVectors(from, to),
        fromDistance: camera.position.length(),
        toDistance: pending.current.distance,
        startedAt: performance.now(),
      }
      pending.current = null
      if (orbit) orbit.enabled = false
    }

    const active = flight.current
    if (!active) return

    const t = Math.min(1, (performance.now() - active.startedAt) / duration)
    const eased = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
    const step = new Quaternion().slerp(active.rotation, eased)
    const distance = active.fromDistance + (active.toDistance - active.fromDistance) * eased
    camera.position.copy(active.from).applyQuaternion(step).multiplyScalar(distance)
    camera.lookAt(0, 0, 0)

    if (t >= 1) {
      flight.current = null
      if (orbit) orbit.enabled = true
    }
  })

  return null
}
