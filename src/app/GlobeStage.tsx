import { useMemo, useRef, useState, type ReactNode } from 'react'
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
import { EMPTY_SCENE, type CountryPaint, type PulseSpec } from '../globe/scene'
import type { Surface } from '../globe/textures'
import { GlobeStageContext, type GlobeStage } from './globeStage'

interface GlobeStageProviderProps {
  geo: GeoData | null
  showGrid: boolean
  /** The player's chosen pin, trail and glow. */
  looks: Cosmetics
  children: ReactNode
}

export function GlobeStageProvider({ geo, showGrid, looks, children }: GlobeStageProviderProps) {
  const pinColor = cosmeticById(PIN_SKINS, looks.pin).color
  const pinShape = pinShapeOf(looks.shape)
  const trail = cosmeticById(TRAILS, looks.trail).id as TrailStyle
  const [scene, setSceneState] = useState(EMPTY_SCENE)
  const [surface, setSurface] = useState<Surface>('day')
  const [autoRotate, setAutoRotate] = useState(true)
  const [shift, setShiftState] = useState<ViewShift>({ x: 0, y: 0 })
  const [focus, setFocus] = useState<CameraFocus | null>(null)
  const pickRef = useRef<((point: LonLat) => void) | null>(null)
  const centerRef = useRef<(() => LonLat) | null>(null)
  const sceneKey = useRef(JSON.stringify(EMPTY_SCENE))

  const stage = useMemo<GlobeStage>(
    () => ({
      setScene(next) {
        // Modes rebuild their scene every render; only update when it actually changed.
        const key = JSON.stringify(next)
        if (key === sceneKey.current) return
        sceneKey.current = key
        setSceneState(next)
      },
      setSurface,
      setAutoRotate,
      setShift: (next) =>
        setShiftState((previous) =>
          previous.x === next.x && previous.y === next.y ? previous : next,
        ),
      flyTo: ({ center, distance }) =>
        setFocus((previous) => ({ id: (previous?.id ?? 0) + 1, center, distance })),
      center: () => centerRef.current?.() ?? null,
      pickRef,
    }),
    [],
  )

  return (
    <GlobeStageContext.Provider value={stage}>
      <div className="stage">
        <Globe
          onPick={(point) => pickRef.current?.(point)}
          showGrid={showGrid}
          autoRotate={autoRotate}
          surface={surface}
          centerRef={centerRef}
          shift={shift}
          glow={cosmeticById(GLOWS, looks.glow).color}
        >
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
              arc.own
                ? { ...arc, style: trail, color: trail === 'comet' ? pinColor : arc.color }
                : arc,
            )}
            markers={scene.markers ?? []}
          />
        </Globe>
      </div>
      {children}
    </GlobeStageContext.Provider>
  )
}

const NO_PULSES: CountryPaint[] = []

/** Pulses are drawn as bold outlines on a layer of their own, which then fades. */
function pulsePaints(pulses: PulseSpec[] | undefined): CountryPaint[] {
  if (!pulses || pulses.length === 0) return NO_PULSES
  return pulses.map(({ id, color }) => ({ id, fill: `${color}33`, stroke: color, lineWidth: 6 }))
}
