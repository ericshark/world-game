import { Html, Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { geoDistance, geoInterpolate } from 'd3-geo'
import { useMemo, useRef, type ComponentRef } from 'react'
import { Color, DoubleSide, Group, Mesh, Quaternion, Vector3 } from 'three'
import type { PinShape, TrailStyle } from '../game/profile/cosmetics'
import type { LonLat } from '../geo/coords'
import { easeOutCubic, useReducedMotion } from '../ui/motion'
import { MAX_CAMERA_DISTANCE } from './constants'
import { lonLatToVector3 } from './coords3d'
import { TARGET_COLOR, type ArcSpec, type GlobeScene, type MarkerSpec } from './scene'

const ARC_SAMPLES = 64
const UP = new Vector3(0, 1, 0)
const PIN_DROP_MS = 380
const ARC_DRAW_MS = 700
/** How high a pin starts its drop, in globe radii. */
const PIN_DROP_HEIGHT = 0.06
/** Labels on the far side of the globe, or right at its edge, are hidden. */
const LABEL_MIN_FACING = 0.25
const MARKER_COLORS: Record<MarkerSpec['kind'], string> = {
  city: '#ffffff',
  start: '#bfe0ff',
  goal: TARGET_COLOR,
}
const toCamera = new Vector3()

/** The pins, arcs and labelled markers of a scene. */
export function Markers({
  pins,
  arcs,
  markers,
}: Pick<GlobeScene, 'pins' | 'arcs'> & { markers: MarkerSpec[] }) {
  return (
    <>
      {pins.map((pin) => (
        <Pin
          key={`pin-${pin.at.join(',')}-${pin.color}-${pin.shape}`}
          at={pin.at}
          color={pin.color}
          shape={pin.shape ?? 'classic'}
        />
      ))}
      {arcs
        .filter((arc) => geoDistance(arc.from, arc.to) > 1e-4)
        .map((arc) => (
          <Arc
            key={`arc-${arc.from.join(',')}-${arc.to.join(',')}-${arc.color}-${arc.style}`}
            {...arc}
          />
        ))}
      {markers.map((marker) => (
        <PlaceMarker key={`marker-${marker.kind}-${marker.at.join(',')}`} {...marker} />
      ))}
    </>
  )
}

/** A dot on the surface with a name beside it, hidden when it turns away from the camera. */
function PlaceMarker({ at, label, kind }: MarkerSpec) {
  const group = useRef<Group>(null)
  const text = useRef<HTMLSpanElement>(null)
  const { normal, quaternion } = useMemo(() => {
    const normal = lonLatToVector3(at)
    return { normal, quaternion: new Quaternion().setFromUnitVectors(UP, normal) }
  }, [at])

  useFrame(({ camera }) => {
    const zoom = (camera.position.length() - 1) / (MAX_CAMERA_DISTANCE - 1)
    group.current?.scale.setScalar(0.35 + 0.65 * zoom)
    if (!text.current) return
    const facing = toCamera.copy(camera.position).normalize().dot(normal)
    text.current.style.opacity = facing > LABEL_MIN_FACING ? '1' : '0'
  })

  return (
    <group ref={group} position={normal} quaternion={quaternion}>
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[0.006, 0.011, 24]} />
        <meshBasicMaterial color={MARKER_COLORS[kind]} toneMapped={false} />
      </mesh>
      <Html position={[0, 0.02, 0]} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <span ref={text} className={`globe-label globe-label--${kind}`}>
          {label}
        </span>
      </Html>
    </group>
  )
}

/**
 * A pin standing on the surface. It drops in with a little bounce, and shrinks as the camera
 * zooms in so it stays readable.
 */
function Pin({ at, color, shape }: { at: LonLat; color: string; shape: PinShape }) {
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
      <PinHead shape={shape} color={color} />
    </group>
  )
}

/** The top of a pin, in the shape the player picked. */
function PinHead({ shape, color }: { shape: PinShape; color: string }) {
  const material = <meshBasicMaterial color={color} toneMapped={false} side={DoubleSide} />
  switch (shape) {
    case 'diamond':
      return (
        <mesh position={[0, 0.048, 0]} scale={[1, 1.4, 1]} raycast={() => null}>
          <octahedronGeometry args={[0.012]} />
          {material}
        </mesh>
      )
    case 'ring':
      return (
        <mesh position={[0, 0.05, 0]} raycast={() => null}>
          <torusGeometry args={[0.01, 0.0035, 10, 24]} />
          {material}
        </mesh>
      )
    case 'flag':
      return (
        <mesh position={[0.011, 0.034, 0]} raycast={() => null}>
          <planeGeometry args={[0.02, 0.013]} />
          {material}
        </mesh>
      )
    default:
      return (
        <mesh position={[0, 0.045, 0]} raycast={() => null}>
          <sphereGeometry args={[0.011, 16, 12]} />
          {material}
        </mesh>
      )
  }
}

/**
 * Great-circle arc that lifts off the surface in proportion to its length and draws itself.
 * An arrow arc stays low and ends in an arrowhead once drawn.
 */
function Arc({ from, to, color = '#ffffff', arrow = false, style = 'solid' }: ArcSpec) {
  const line = useRef<ComponentRef<typeof Line>>(null)
  const head = useRef<Mesh>(null)
  const drawnFrom = useRef<number | null>(null)
  const reducedMotion = useReducedMotion()
  useFrame(() => {
    if (!line.current) return
    drawnFrom.current ??= performance.now()
    const t = reducedMotion ? 1 : Math.min(1, (performance.now() - drawnFrom.current) / ARC_DRAW_MS)
    // Line2 draws one instance per segment, so drawing fewer reveals the arc progressively.
    line.current.geometry.instanceCount = Math.max(1, Math.ceil(easeOutCubic(t) * ARC_SAMPLES))
    if (head.current) head.current.visible = t >= 1
  })
  // The arrowhead keeps its size on screen, like the pins.
  useFrame(({ camera }) => {
    const zoom = (camera.position.length() - 1) / (MAX_CAMERA_DISTANCE - 1)
    head.current?.scale.setScalar(0.35 + 0.65 * zoom)
  })

  const { points, tip, tipQuaternion } = useMemo(() => {
    const interpolate = geoInterpolate(from, to)
    const lift = arrow ? 0.004 : Math.min(0.25, geoDistance(from, to) * 0.3)
    const points = Array.from({ length: ARC_SAMPLES + 1 }, (_, i) => {
      const t = i / ARC_SAMPLES
      return lonLatToVector3(interpolate(t), 1.004 + lift * Math.sin(Math.PI * t))
    })
    const tip = points[ARC_SAMPLES]
    const direction = tip
      .clone()
      .sub(points[ARC_SAMPLES - 1])
      .normalize()
    return { points, tip, tipQuaternion: new Quaternion().setFromUnitVectors(UP, direction) }
  }, [from, to, arrow])
  const vertexColors = useMemo(() => trailColors(style, color), [style, color])

  return (
    <>
      <Line
        ref={line}
        points={points}
        color={vertexColors ? '#ffffff' : color}
        vertexColors={vertexColors ?? undefined}
        lineWidth={style === 'comet' ? 3 : 2}
        dashed={style === 'dashed'}
        dashSize={0.02}
        gapSize={0.014}
        transparent
        opacity={0.9}
      />
      {arrow && (
        <mesh ref={head} position={tip} quaternion={tipQuaternion} raycast={() => null}>
          <coneGeometry args={[0.012, 0.03, 12]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      )}
    </>
  )
}

/** Per-point colours for the fancier trails: a comet brightens towards its head. */
function trailColors(style: TrailStyle, color: string): [number, number, number][] | null {
  if (style !== 'comet' && style !== 'rainbow') return null
  const base = new Color(color)
  return Array.from({ length: ARC_SAMPLES + 1 }, (_, i) => {
    const t = i / ARC_SAMPLES
    const point =
      style === 'comet'
        ? base.clone().multiplyScalar(0.15 + 0.85 * t)
        : new Color().setHSL(t * 0.8, 0.9, 0.62)
    return [point.r, point.g, point.b]
  })
}

/** Ease-out with a small bounce at the end, for pins landing. */
function bounce(t: number): number {
  if (t < 0.7) return easeOutCubic(t / 0.7)
  const settle = (t - 0.7) / 0.3
  return 1 + Math.sin(settle * Math.PI) * 0.12 * (1 - settle)
}
