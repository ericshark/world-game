import { useFrame, useThree } from '@react-three/fiber'
import { geoCentroid, geoCircle, geoEquirectangular, geoPath } from 'd3-geo'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { CanvasTexture, MeshBasicMaterial, SRGBColorSpace } from 'three'
import type { CountryIndex } from '../geo/countries'
import { easeOutCubic, useReducedMotion } from '../ui/motion'
import type { CountryPaint } from './scene'

// The overlay is an equirectangular image wrapped on a sphere just above the Earth, so d3 can
// draw any country (multipolygons, antimeridian crossings) with an ordinary 2D canvas path.
const MAX_OVERLAY_WIDTH = 4096
const OVERLAY_RADIUS = 1.002
/** Micro-states are invisible at globe scale, so they also get a ring of this radius. */
const MICRO_RING_RADIUS_DEG = 1.2
const FADE_IN_MS = 450
/** Pulses are bold outlines, so a smaller overlay is plenty and saves memory. */
const PULSE_OVERLAY_WIDTH = 2048
const PULSE_RADIUS = 1.0025
const PULSE_MS = 2400
const PULSE_BEATS = 3

interface CountryPaintLayerProps {
  countries: CountryIndex
  paints: CountryPaint[]
  /** "fade": new paints fade in and stay. "pulse": they beat a few times, then fade away. */
  effect?: 'fade' | 'pulse'
}

export function CountryPaintLayer({ countries, paints, effect = 'fade' }: CountryPaintLayerProps) {
  const maxTextureSize = useThree((state) => state.gl.capabilities.maxTextureSize)
  const pulse = effect === 'pulse'
  const surface = useMemo(
    () =>
      new PaintSurface(Math.min(pulse ? PULSE_OVERLAY_WIDTH : MAX_OVERLAY_WIDTH, maxTextureSize)),
    [maxTextureSize, pulse],
  )
  useEffect(() => () => surface.dispose(), [surface])

  // New paints fade in, so a reveal lands softly instead of popping.
  const material = useRef<MeshBasicMaterial>(null)
  const changedAt = useRef(0)
  const reducedMotion = useReducedMotion()
  useLayoutEffect(() => {
    if (surface.paint(countries, paints)) changedAt.current = performance.now()
  })
  useFrame(() => {
    if (!material.current) return
    const elapsed = performance.now() - changedAt.current
    const opacity = pulse
      ? pulseOpacity(elapsed / PULSE_MS, reducedMotion)
      : easeOutCubic(reducedMotion ? 1 : Math.min(1, Math.max(0, elapsed / FADE_IN_MS)))
    material.current.opacity = opacity
    // A finished pulse costs nothing to draw.
    material.current.visible = opacity > 0
  })

  return (
    <mesh
      scale={pulse ? PULSE_RADIUS : OVERLAY_RADIUS}
      raycast={() => null}
      visible={paints.length > 0}
    >
      <sphereGeometry args={[1, 128, 64]} />
      <meshBasicMaterial
        ref={material}
        map={surface.texture}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}

/** A few beats that die away; with reduced motion, a steady outline that then fades. */
function pulseOpacity(t: number, reducedMotion: boolean): number {
  if (t >= 1 || t < 0) return 0
  if (reducedMotion) return 0.8 * (1 - easeOutCubic(t))
  return Math.sin(Math.PI * PULSE_BEATS * t) ** 2 * (1 - t * 0.6)
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

  /** Redraws if the paints changed; returns whether it did. */
  paint(countries: CountryIndex, paints: CountryPaint[]): boolean {
    const key = paints.map((p) => `${p.id}/${p.fill}/${p.stroke}/${p.lineWidth}`).join('|')
    if (key === this.drawnKey && countries === this.drawnCountries) return false
    this.drawnKey = key
    this.drawnCountries = countries
    // Nothing to show: the layer is hidden, so skip clearing and re-uploading the texture.
    if (paints.length === 0) return false
    drawPaints(this.canvas, countries, paints)
    this.texture.needsUpdate = true
    return true
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
