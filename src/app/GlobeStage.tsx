import { lazy, Suspense, useMemo, useRef, useState, type ReactNode } from 'react'
import type { LonLat } from '../geo/coords'
import type { GeoData } from '../geo/facts'
import type { CameraFocus } from '../globe/CameraRig'
import type { Cosmetics } from '../game/profile/profile'
import { EMPTY_SCENE } from '../globe/scene'
import type { Surface } from '../globe/textures'
import type { ViewShift } from '../globe/Globe'
import { GlobeStageContext, type GlobeStage } from './globeStage'

// three.js and the globe are big; they download in a chunk of their own.
const GlobeView = lazy(() => import('./GlobeView'))

interface GlobeStageProviderProps {
  geo: GeoData | null
  showGrid: boolean
  /** The player's chosen pin, trail and glow. */
  looks: Cosmetics
  /** Reports the Earth's first load, for the loading screen. */
  onLoad: (progress: number, ready: boolean) => void
  children: ReactNode
}

export function GlobeStageProvider({
  geo,
  showGrid,
  looks,
  onLoad,
  children,
}: GlobeStageProviderProps) {
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
        <Suspense fallback={null}>
          <GlobeView
            geo={geo}
            showGrid={showGrid}
            looks={looks}
            scene={scene}
            surface={surface}
            autoRotate={autoRotate}
            shift={shift}
            focus={focus}
            onPick={(point) => pickRef.current?.(point)}
            centerRef={centerRef}
            onLoad={onLoad}
          />
        </Suspense>
      </div>
      {children}
    </GlobeStageContext.Provider>
  )
}
