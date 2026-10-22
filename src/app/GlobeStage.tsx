import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { LonLat } from '../geo/coords'
import type { GeoData } from '../geo/facts'
import { CameraRig, type CameraFocus } from '../globe/CameraRig'
import { CountryPaintLayer } from '../globe/CountryPaintLayer'
import { Globe, type ViewShift } from '../globe/Globe'
import { Markers } from '../globe/Markers'
import { EMPTY_SCENE } from '../globe/scene'
import type { Surface } from '../globe/textures'
import { GlobeStageContext, type GlobeStage } from './globeStage'

interface GlobeStageProviderProps {
  geo: GeoData | null
  showGrid: boolean
  children: ReactNode
}

export function GlobeStageProvider({ geo, showGrid, children }: GlobeStageProviderProps) {
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
        >
          <CameraRig focus={focus} />
          {geo && <CountryPaintLayer countries={geo.countries} paints={scene.paints} />}
          <Markers pins={scene.pins} arcs={scene.arcs} />
        </Globe>
      </div>
      {children}
    </GlobeStageContext.Provider>
  )
}
