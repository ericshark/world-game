import { useThree } from '@react-three/fiber'
import { geoCentroid, geoCircle, geoEquirectangular, geoPath } from 'd3-geo'
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import type { CountryIndex } from '../geo/countries'
import type { CountryPaint } from './scene'

// The overlay is an equirectangular image wrapped on a sphere just above the Earth, so d3 can
// draw any country (multipolygons, antimeridian crossings) with an ordinary 2D canvas path.
const MAX_OVERLAY_WIDTH = 4096
const OVERLAY_RADIUS = 1.002
/** Micro-states are invisible at globe scale, so they also get a ring of this radius. */
const MICRO_RING_RADIUS_DEG = 1.2

interface CountryPaintLayerProps {
  countries: CountryIndex
  paints: CountryPaint[]
}

export function CountryPaintLayer({ countries, paints }: CountryPaintLayerProps) {
  const maxTextureSize = useThree((state) => state.gl.capabilities.maxTextureSize)
  const surface = useMemo(
    () => new PaintSurface(Math.min(MAX_OVERLAY_WIDTH, maxTextureSize)),
    [maxTextureSize],
  )
  useEffect(() => () => surface.dispose(), [surface])
  useLayoutEffect(() => surface.paint(countries, paints))

  return (
    <mesh scale={OVERLAY_RADIUS} raycast={() => null} visible={paints.length > 0}>
      <sphereGeometry args={[1, 128, 64]} />
      <meshBasicMaterial map={surface.texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

/**
 * One canvas and texture reused for every reveal: re-allocating 32 MB each time is wasteful,
 * especially on phones. Modes rebuild their paint lists on every render, so it only redraws
 * when the content actually changes.
 */
class PaintSurface {
  readonly texture: CanvasTexture
  private readonly canvas: HTMLCanvasElement
  private drawnKey: string | null = null
  private drawnCountries: CountryIndex | null = null

  constructor(width: number) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = width / 2
    this.texture = new CanvasTexture(this.canvas)
    this.texture.colorSpace = SRGBColorSpace
    this.texture.anisotropy = 8
  }

  paint(countries: CountryIndex, paints: CountryPaint[]) {
    const key = paints.map((p) => `${p.id}/${p.fill}/${p.stroke}/${p.lineWidth}`).join('|')
    if (key === this.drawnKey && countries === this.drawnCountries) return
    this.drawnKey = key
    this.drawnCountries = countries
    drawPaints(this.canvas, countries, paints)
    this.texture.needsUpdate = true
  }

  dispose() {
    this.texture.dispose()
  }
}

function drawPaints(canvas: HTMLCanvasElement, countries: CountryIndex, paints: CountryPaint[]) {
  const context = canvas.getContext('2d')!
  context.clearRect(0, 0, canvas.width, canvas.height)
  const projection = geoEquirectangular()
    .scale(canvas.width / (2 * Math.PI))
    .translate([canvas.width / 2, canvas.height / 2])
  const path = geoPath(projection, context)
  // Line widths were tuned on a 4096-wide overlay.
  const lineScale = canvas.width / MAX_OVERLAY_WIDTH
  context.lineJoin = 'round'

  for (const paint of paints) {
    const feature = countries.get(paint.id)
    if (!feature) continue

    context.beginPath()
    path(feature)
    context.fillStyle = paint.fill
    context.fill()
    context.strokeStyle = paint.stroke
    context.lineWidth = paint.lineWidth * lineScale
    context.stroke()

    if (feature.properties.isMicro) {
      context.beginPath()
      path(geoCircle().center(geoCentroid(feature)).radius(MICRO_RING_RADIUS_DEG)())
      context.lineWidth = (paint.lineWidth + 1) * lineScale
      context.stroke()
    }
  }
}
