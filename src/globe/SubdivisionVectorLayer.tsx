import { Line } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { geoCircle } from 'd3-geo'
import { useEffect, useMemo, useState } from 'react'
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  ShapeUtils,
  Vector2,
  Vector3,
} from 'three'
import type { BorderLinesData } from '../geo/borders'
import type { LonLat } from '../geo/coords'
import type { CountryFeature } from '../geo/countries'
import {
  isSubPackId,
  loadSubdivisionPack,
  peekSubdivisionPack,
  type SubPackId,
  type SubdivisionPack,
} from '../geo/subdivisions'
import { lonLatToVector3 } from './coords3d'
import type { CountryPaint, PulseSpec } from './scene'

/** Above the country paint overlay (1.002) and pulse layer (1.0025). */
const SUB_BORDER_RADIUS = 1.0028
const SUB_FILL_RADIUS = 1.003
const SUB_STROKE_RADIUS = 1.0033
const SUB_PULSE_RADIUS = 1.0036
const MAX_STEP_DEG = 1.2
const MICRO_RING_RADIUS_DEG = 0.7

interface SubdivisionVectorLayerProps {
  packId: string
  paints: CountryPaint[]
  pulses?: PulseSpec[]
  showBorders: boolean
  night?: boolean
}

/**
 * Vector rendering for states and provinces. At high zoom over small states (such as Rhode
 * Island or Bremen) the 4096 px equirectangular paint texture only has a handful of pixels per
 * state, so subdivision borders, fills and outlines are drawn as 3D meshes and lines directly on
 * the sphere.
 */
export function SubdivisionVectorLayer({
  packId,
  paints,
  pulses,
  showBorders,
  night = false,
}: SubdivisionVectorLayerProps) {
  const invalidate = useThree((state) => state.invalidate)
  const validId: SubPackId | null = isSubPackId(packId) ? packId : null
  const [pack, setPack] = useState<SubdivisionPack | null>(() =>
    validId ? peekSubdivisionPack(validId) : null,
  )

  useEffect(() => {
    if (!validId || peekSubdivisionPack(validId)) return
    let cancelled = false
    loadSubdivisionPack(validId)
      .then((loaded) => {
        if (cancelled) return
        setPack(loaded)
        invalidate()
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [validId, invalidate])

  const activePack = validId
    ? pack?.countryId === validId
      ? pack
      : peekSubdivisionPack(validId)
    : null

  const borderPoints = useMemo(
    () => (activePack && showBorders ? segmentPoints(activePack.borders, SUB_BORDER_RADIUS) : null),
    [activePack, showBorders],
  )

  if (!activePack) return null

  return (
    <group>
      {borderPoints && borderPoints.length > 0 && (
        <Line
          segments
          points={borderPoints}
          color={night ? '#9fb0ff' : '#ffffff'}
          lineWidth={1.1}
          transparent
          opacity={night ? 0.45 : 0.55}
          depthWrite={false}
          raycast={() => null}
        />
      )}
      {paints.map((paint, index) => (
        <FeatureVectorShape
          key={`${paint.id}-${index}-${paint.fill}-${paint.stroke}`}
          pack={activePack}
          paint={paint}
          fillRadius={SUB_FILL_RADIUS + index * 0.00005}
          strokeRadius={SUB_STROKE_RADIUS + index * 0.00005}
        />
      ))}
      {pulses?.map((pulse, index) => (
        <FeatureVectorShape
          key={`pulse-${pulse.id}-${index}`}
          pack={activePack}
          paint={{ id: pulse.id, fill: 'rgb(0 0 0 / 0)', stroke: pulse.color, lineWidth: 3.5 }}
          fillRadius={SUB_PULSE_RADIUS}
          strokeRadius={SUB_PULSE_RADIUS}
        />
      ))}
    </group>
  )
}

function FeatureVectorShape({
  pack,
  paint,
  fillRadius,
  strokeRadius,
}: {
  pack: SubdivisionPack
  paint: CountryPaint
  fillRadius: number
  strokeRadius: number
}) {
  const feature = pack.countries.get(paint.id)
  const fillStyle = useMemo(() => parseCssColor(paint.fill), [paint.fill])
  const strokeStyle = useMemo(() => parseCssColor(paint.stroke), [paint.stroke])

  const fillGeo = useMemo(
    () => (feature && fillStyle.opacity > 0 ? buildFillGeometry(feature, fillRadius) : null),
    [feature, fillStyle.opacity, fillRadius],
  )
  useEffect(() => () => fillGeo?.dispose(), [fillGeo])

  const strokePoints = useMemo(
    () =>
      feature && strokeStyle.opacity > 0 ? buildStrokePoints(feature, pack, strokeRadius) : null,
    [feature, pack, strokeStyle.opacity, strokeRadius],
  )

  if (!feature) return null

  return (
    <>
      {fillGeo && (
        <mesh geometry={fillGeo} raycast={() => null}>
          <meshBasicMaterial
            color={fillStyle.color}
            transparent
            opacity={fillStyle.opacity}
            depthWrite={false}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
      )}
      {strokePoints && strokePoints.length > 0 && (
        <Line
          segments
          points={strokePoints}
          color={strokeStyle.color}
          lineWidth={paint.lineWidth}
          transparent
          opacity={strokeStyle.opacity}
          depthWrite={false}
          raycast={() => null}
        />
      )}
    </>
  )
}

function parseCssColor(css: string): { color: string; opacity: number } {
  const rgbMatch = css.match(/rgb\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\s*\)/)
  if (rgbMatch) {
    const [, r, g, b, a] = rgbMatch
    const hex = [r, g, b].map((n) => Number(n).toString(16).padStart(2, '0')).join('')
    return { color: `#${hex}`, opacity: a !== undefined ? Number(a) : 1 }
  }
  if (/^#[0-9a-fA-F]{8}$/.test(css)) {
    return {
      color: css.slice(0, 7),
      opacity: parseInt(css.slice(7, 9), 16) / 255,
    }
  }
  return { color: css, opacity: 1 }
}

function buildFillGeometry(feature: CountryFeature, radius: number): BufferGeometry {
  const positions: number[] = []
  const polygons =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates

  for (const poly of polygons) {
    const outer = poly[0]
    if (!outer || outer.length < 4) continue
    const contour = outer.slice(0, -1).map(([lon, lat]) => new Vector2(lon, lat))
    const holes = poly
      .slice(1)
      .filter((ring) => ring.length >= 4)
      .map((ring) => ring.slice(0, -1).map(([lon, lat]) => new Vector2(lon, lat)))
    const allPts = [...contour, ...holes.flat()]
    const faces = ShapeUtils.triangulateShape(contour, holes)
    for (const [a, b, c] of faces) {
      const va = lonLatToVector3([allPts[a].x, allPts[a].y], radius)
      const vb = lonLatToVector3([allPts[b].x, allPts[b].y], radius)
      const vc = lonLatToVector3([allPts[c].x, allPts[c].y], radius)
      pushSubdividedTriangle(positions, va, vb, vc, radius, 0)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return geometry
}

function pushSubdividedTriangle(
  positions: number[],
  va: Vector3,
  vb: Vector3,
  vc: Vector3,
  radius: number,
  depth: number,
) {
  const midX = (va.x + vb.x + vc.x) / 3
  const midY = (va.y + vb.y + vc.y) / 3
  const midZ = (va.z + vb.z + vc.z) / 3
  if (depth >= 3 || Math.hypot(midX, midY, midZ) >= 1.0012) {
    positions.push(va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z)
    return
  }
  const mab = va.clone().add(vb).multiplyScalar(0.5).setLength(radius)
  const mbc = vb.clone().add(vc).multiplyScalar(0.5).setLength(radius)
  const mca = vc.clone().add(va).multiplyScalar(0.5).setLength(radius)
  pushSubdividedTriangle(positions, va, mab, mca, radius, depth + 1)
  pushSubdividedTriangle(positions, mab, vb, mbc, radius, depth + 1)
  pushSubdividedTriangle(positions, mca, mbc, vc, radius, depth + 1)
  pushSubdividedTriangle(positions, mab, mbc, mca, radius, depth + 1)
}

function buildStrokePoints(
  feature: CountryFeature,
  pack: SubdivisionPack,
  radius: number,
): Vector3[] {
  const polygons =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates
  const rings: LonLat[][] = polygons.flatMap((poly) => poly as LonLat[][])
  if (feature.properties.isMicro) {
    const circle = geoCircle()
      .center(pack.factsOf(feature.properties.id).label)
      .radius(MICRO_RING_RADIUS_DEG)()
    rings.push(...(circle.coordinates as LonLat[][]))
  }
  return segmentPoints(rings, radius)
}

function segmentPoints(lines: BorderLinesData, radius: number): Vector3[] {
  const points: Vector3[] = []
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const [lon0, lat0] = line[i - 1]
      const [lon1, lat1] = line[i]
      if (Math.abs(lon1 - lon0) > 180) continue
      const steps = Math.max(
        1,
        Math.ceil(Math.max(Math.abs(lon1 - lon0), Math.abs(lat1 - lat0)) / MAX_STEP_DEG),
      )
      for (let s = 0; s < steps; s++) {
        const a = s / steps
        const b = (s + 1) / steps
        points.push(
          lonLatToVector3([lon0 + (lon1 - lon0) * a, lat0 + (lat1 - lat0) * a], radius),
          lonLatToVector3([lon0 + (lon1 - lon0) * b, lat0 + (lat1 - lat0) * b], radius),
        )
      }
    }
  }
  return points
}
