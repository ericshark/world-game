import { geoCentroid, geoCircle, geoEquirectangular, geoPath } from 'd3-geo'
import { useEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import type { CountryFeature } from '../geo/countries'

// The overlay is an equirectangular image wrapped on a sphere just above the Earth, so d3 can
// draw any country (multipolygons, antimeridian crossings) with an ordinary 2D canvas path.
const OVERLAY_WIDTH = 4096
const OVERLAY_HEIGHT = OVERLAY_WIDTH / 2
const OVERLAY_RADIUS = 1.002
/** Micro-states are invisible at globe scale, so they also get a ring of this radius. */
const MICRO_RING_RADIUS_DEG = 1.2

export const TARGET_COLOR = '#ffd54a'
export const CLICKED_COLOR = '#ff6b6b'

interface HighlightOverlayProps {
  target: CountryFeature
  /** Outlined in a second colour when it differs from the target. */
  clicked: CountryFeature | null
}

export function HighlightOverlay({ target, clicked }: HighlightOverlayProps) {
  const texture = useMemo(() => drawHighlight(target, clicked), [target, clicked])
  useEffect(() => () => texture.dispose(), [texture])

  return (
    <mesh scale={OVERLAY_RADIUS} raycast={() => null}>
      <sphereGeometry args={[1, 128, 64]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

function drawHighlight(target: CountryFeature, clicked: CountryFeature | null): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = OVERLAY_WIDTH
  canvas.height = OVERLAY_HEIGHT
  const context = canvas.getContext('2d')!
  const projection = geoEquirectangular()
    .scale(OVERLAY_WIDTH / (2 * Math.PI))
    .translate([OVERLAY_WIDTH / 2, OVERLAY_HEIGHT / 2])
  const path = geoPath(projection, context)

  context.lineJoin = 'round'

  if (clicked && clicked.properties.id !== target.properties.id) {
    context.beginPath()
    path(clicked)
    context.fillStyle = 'rgb(255 107 107 / 0.18)'
    context.fill()
    context.strokeStyle = CLICKED_COLOR
    context.lineWidth = 2.5
    context.stroke()
  }

  context.beginPath()
  path(target)
  context.fillStyle = 'rgb(255 213 74 / 0.42)'
  context.fill()
  context.strokeStyle = TARGET_COLOR
  context.lineWidth = 3
  context.stroke()

  if (target.properties.isMicro) {
    context.beginPath()
    path(geoCircle().center(geoCentroid(target)).radius(MICRO_RING_RADIUS_DEG)())
    context.lineWidth = 4
    context.stroke()
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}
