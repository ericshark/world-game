import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { geoDistance, geoInterpolate } from 'd3-geo'
import { useMemo, useRef, type ComponentRef } from 'react'
import { Group, Quaternion, Vector3 } from 'three'
import type { LonLat } from '../geo/coords'
import { easeOutCubic, useReducedMotion } from '../ui/motion'
import { MAX_CAMERA_DISTANCE } from './constants'
import { lonLatToVector3 } from './coords3d'
import type { GlobeScene } from './scene'

const ARC_SAMPLES = 64
const UP = new Vector3(0, 1, 0)
const PIN_DROP_MS = 380
const ARC_DRAW_MS = 700
/** How high a pin starts its drop, in globe radii. */
const PIN_DROP_HEIGHT = 0.06

/** The pins and arcs of a scene. */
export function Markers({ pins, arcs }: Pick<GlobeScene, 'pins' | 'arcs'>) {
  return (
    <>
      {pins.map((pin) => (
        <Pin key={`pin-${pin.at.join(',')}-${pin.color}`} at={pin.at} color={pin.color} />
      ))}
      {arcs
        .filter((arc) => geoDistance(arc.from, arc.to) > 1e-4)
        .map((arc) => (
          <Arc key={`arc-${arc.from.join(',')}-${arc.to.join(',')}`} from={arc.from} to={arc.to} />
        ))}
    </>
  )
}

/**
 * A pin standing on the surface. It drops in with a little bounce, and shrinks as the camera
 * zooms in so it stays readable.
 */
function Pin({ at, color }: { at: LonLat; color: string }) {
  const group = useRef<Group>(null)
  const placedAt = useRef<number | null>(null)
  const reducedMotion = useReducedMotion()
  const { normal, quaternion } = useMemo(() => {
    const normal = lonLatToVector3(at)
    return { normal, quaternion: new Quaternion().setFromUnitVectors(UP, normal) }
  }, [at])

  useFrame(({ camera }) => {
    if (!group.current) return
    placedAt.current ??= performance.now()
    const zoom = (camera.position.length() - 1) / (MAX_CAMERA_DISTANCE - 1)
    const scale = 0.35 + 0.65 * zoom
    group.current.scale.setScalar(scale)
    const t = reducedMotion ? 1 : Math.min(1, (performance.now() - placedAt.current) / PIN_DROP_MS)
    const height = PIN_DROP_HEIGHT * scale * (1 - bounce(t))
    group.current.position.copy(normal).multiplyScalar(1 + height)
  })

  return (
    <group ref={group} position={normal} quaternion={quaternion}>
      <mesh position={[0, 0.02, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.0025, 0.0025, 0.04, 8]} />
        <meshBasicMaterial color="#f5f5f5" />
      </mesh>
      <mesh position={[0, 0.045, 0]} raycast={() => null}>
        <sphereGeometry args={[0.011, 16, 12]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Great-circle arc that lifts off the surface in proportion to its length and draws itself. */
function Arc({ from, to }: { from: LonLat; to: LonLat }) {
  const line = useRef<ComponentRef<typeof Line>>(null)
  const drawnFrom = useRef<number | null>(null)
  const reducedMotion = useReducedMotion()
  useFrame(() => {
    if (!line.current) return
    drawnFrom.current ??= performance.now()
    const t = reducedMotion ? 1 : Math.min(1, (performance.now() - drawnFrom.current) / ARC_DRAW_MS)
    // Line2 draws one instance per segment, so drawing fewer reveals the arc progressively.
    line.current.geometry.instanceCount = Math.max(1, Math.ceil(easeOutCubic(t) * ARC_SAMPLES))
  })

  const points = useMemo(() => {
    const interpolate = geoInterpolate(from, to)
    const lift = Math.min(0.25, geoDistance(from, to) * 0.3)
    return Array.from({ length: ARC_SAMPLES + 1 }, (_, i) => {
      const t = i / ARC_SAMPLES
      return lonLatToVector3(interpolate(t), 1.004 + lift * Math.sin(Math.PI * t))
    })
  }, [from, to])

  return <Line ref={line} points={points} color="#ffffff" lineWidth={2} transparent opacity={0.9} />
}

/** Ease-out with a small bounce at the end, for pins landing. */
function bounce(t: number): number {
  if (t < 0.7) return easeOutCubic(t / 0.7)
  const settle = (t - 0.7) / 0.3
  return 1 + Math.sin(settle * Math.PI) * 0.12 * (1 - settle)
}
