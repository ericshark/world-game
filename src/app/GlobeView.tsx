import { useProgress } from '@react-three/drei'
import { useEffect, type RefObject } from 'react'
import type { LonLat } from '../geo/coords'
import type { GeoData } from '../geo/facts'
import { CameraRig, type CameraFocus } from '../globe/CameraRig'
import { CountryPaintLayer } from '../globe/CountryPaintLayer'
import { Globe, type ViewShift } from '../globe/Globe'
import { Markers } from '../globe/Markers'
import {
  cosmeticById,
  GLOWS,
  PIN_SKINS,
  pinShapeOf,
  TRAILS,
  type TrailStyle,
} from '../game/profile/cosmetics'
import type { Cosmetics } from '../game/profile/profile'
import { type CountryPaint, type GlobeScene, type PulseSpec } from '../globe/scene'
import type { Surface } from '../globe/textures'

export interface GlobeViewProps {
  geo: GeoData | null
  showGrid: boolean
  looks: Cosmetics
  scene: GlobeScene
  surface: Surface
  autoRotate: boolean
  shift: ViewShift
  focus: CameraFocus | null
  onPick: (point: LonLat) => void
  centerRef: RefObject<(() => LonLat) | null>
  /** Reports how far the first load has got, and whether the Earth is ready to look at. */
  onLoad: (progress: number, ready: boolean) => void
}

/**
 * The 3D scene. It lives in a chunk of its own, with three.js, so the menus can appear before
 * the 3D libraries have downloaded.
 */
export default function GlobeView({
  geo,
  showGrid,
  looks,
  scene,
  surface,
  autoRotate,
  shift,
  focus,
  onPick,
  centerRef,
  onLoad,
}: GlobeViewProps) {
  const pinColor = cosmeticById(PIN_SKINS, looks.pin).color
  const pinShape = pinShapeOf(looks.shape)
  const trail = cosmeticById(TRAILS, looks.trail).id as TrailStyle

  return (
    <Globe
      onPick={onPick}
      showGrid={showGrid}
      autoRotate={autoRotate}
      surface={surface}
      centerRef={centerRef}
      shift={shift}
      glow={cosmeticById(GLOWS, looks.glow).color}
    >
      <LoadReporter onLoad={onLoad} />
      <CameraRig focus={focus} />
      {geo && <CountryPaintLayer countries={geo.countries} paints={scene.paints} />}
      {geo && (
        <CountryPaintLayer
          countries={geo.countries}
          paints={pulsePaints(scene.pulses)}
          effect="pulse"
        />
      )}
      <Markers
        pins={scene.pins.map((pin) =>
          pin.own ? { ...pin, color: pinColor, shape: pinShape } : pin,
        )}
        // A comet trail takes the colour of the pin it flies from.
        arcs={scene.arcs.map((arc) =>
          arc.own ? { ...arc, style: trail, color: trail === 'comet' ? pinColor : arc.color } : arc,
        )}
        markers={scene.markers ?? []}
      />
    </Globe>
  )
}

/** The first Earth texture has loaded once something was loaded and nothing is still loading. */
function LoadReporter({ onLoad }: { onLoad: GlobeViewProps['onLoad'] }) {
  const { active, progress, loaded } = useProgress()
  const ready = loaded > 0 && !active
  useEffect(() => onLoad(ready ? 100 : Math.round(progress), ready), [onLoad, progress, ready])
  return null
}

const NO_PULSES: CountryPaint[] = []

/** Pulses are drawn as bold outlines on a layer of their own, which then fades. */
function pulsePaints(pulses: PulseSpec[] | undefined): CountryPaint[] {
  if (!pulses || pulses.length === 0) return NO_PULSES
  return pulses.map(({ id, color }) => ({ id, fill: `${color}33`, stroke: color, lineWidth: 6 }))
}
