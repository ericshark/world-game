import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { geoDistance, geoInterpolate } from 'd3-geo'
import { useMemo, useRef } from 'react'
import { Group, Quaternion, Vector3 } from 'three'
import { lonLatToVector3, type LonLat } from '../geo/coords'
import { MAX_CAMERA_DISTANCE } from './constants'
import { CLICKED_COLOR, TARGET_COLOR } from './HighlightOverlay'

const ARC_SAMPLES = 64
const UP = new Vector3(0, 1, 0)

interface PinAndArcProps {
  pin: LonLat
  /** Once revealed: the closest point of the target, joined to the pin by an arc. */
  nearest?: LonLat
}

export function PinAndArc({ pin, nearest }: PinAndArcProps) {
  const showArc = nearest && geoDistance(pin, nearest) > 1e-4
  return (
    <>
      <Marker at={pin} color={CLICKED_COLOR} />
      {showArc && (
        <>
          <Marker at={nearest} color={TARGET_COLOR} />
          <Arc from={pin} to={nearest} />
        </>
      )}
    </>
  )
}

/** A pin standing on the surface; it shrinks as the camera zooms in so it stays readable. */
function Marker({ at, color }: { at: LonLat; color: string }) {
  const group = useRef<Group>(null)
  const { position, quaternion } = useMemo(() => {
    const normal = lonLatToVector3(at)
    return { position: normal, quaternion: new Quaternion().setFromUnitVectors(UP, normal) }
  }, [at])

  useFrame(({ camera }) => {
    const zoom = (camera.position.length() - 1) / (MAX_CAMERA_DISTANCE - 1)
    group.current?.scale.setScalar(0.35 + 0.65 * zoom)
  })

  return (
    <group ref={group} position={position} quaternion={quaternion}>
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

/** Great-circle arc that lifts off the surface in proportion to its length. */
function Arc({ from, to }: { from: LonLat; to: LonLat }) {
  const points = useMemo(() => {
    const interpolate = geoInterpolate(from, to)
    const lift = Math.min(0.25, geoDistance(from, to) * 0.3)
    return Array.from({ length: ARC_SAMPLES + 1 }, (_, i) => {
      const t = i / ARC_SAMPLES
      return lonLatToVector3(interpolate(t), 1.004 + lift * Math.sin(Math.PI * t))
    })
  }, [from, to])

  return <Line points={points} color="#ffffff" lineWidth={2} transparent opacity={0.9} />
}
