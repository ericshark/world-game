import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { LonLat } from '../geo/coords'
import type { GeoData } from '../geo/facts'
import type { CameraFocus } from '../globe/CameraRig'
import type { Cosmetics } from '../game/profile/profile'
import { EMPTY_SCENE } from '../globe/scene'
import type { Surface } from '../globe/textures'
import type { ViewShift } from '../globe/Globe'
import { webglSupported, type ContextState } from '../globe/contextLoss'
import { ErrorBoundary } from '../ui/ErrorBoundary'
import { GlobeStageContext, type GlobeStage } from './globeStage'

// three.js and the globe are big; they download in a chunk of their own.
const GlobeView = lazy(() => import('./GlobeView'))

interface GlobeStageProviderProps {
  geo: GeoData | null
  showGrid: boolean
  showBorders: boolean
  /** The player's chosen pin, trail and glow. */
  looks: Cosmetics
  /** Reports the Earth's first load, for the loading screen. */
  onLoad: (progress: number, ready: boolean) => void
  children: ReactNode
}

export function GlobeStageProvider({
  geo,
  showGrid,
  showBorders,
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
  const [context, setContext] = useState<ContextState>('ok')
  const [supported] = useState(webglSupported)

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
        {supported ? (
          <ErrorBoundary
            fallback={() => <GlobeNotice kind="unavailable" onShown={() => onLoad(100, true)} />}
          >
            <Suspense fallback={null}>
              <GlobeView
                geo={geo}
                showGrid={showGrid}
                showBorders={showBorders}
                looks={looks}
                scene={scene}
                surface={surface}
                autoRotate={autoRotate}
                shift={shift}
                focus={focus}
                onPick={(point) => pickRef.current?.(point)}
                centerRef={centerRef}
                onLoad={onLoad}
                onContextChange={setContext}
              />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <GlobeNotice kind="unavailable" onShown={() => onLoad(100, true)} />
        )}
        {context === 'lost' && <GlobeNotice kind="lost" />}
      </div>
      {children}
    </GlobeStageContext.Provider>
  )
}

/**
 * Explains a missing or stalled globe. The menus keep working either way; a lost graphics
 * context usually comes back by itself, and a reload is offered if it does not.
 */
function GlobeNotice({
  kind,
  onShown,
}: {
  kind: 'unavailable' | 'lost'
  /** Without a globe there is nothing to wait for: the loading screen can go. */
  onShown?: () => void
}) {
  const [waited, setWaited] = useState(false)
  useEffect(() => onShown?.(), [onShown])
  useEffect(() => {
    if (kind !== 'lost') return
    const timer = window.setTimeout(() => setWaited(true), 4000)
    return () => window.clearTimeout(timer)
  }, [kind])
  return (
    <div className="globe-notice" role="alert">
      {kind === 'unavailable' ? (
        <p>
          The 3D globe is not available in this browser or on this device, so games that need it
          cannot be played here. Try another browser, or turn on hardware acceleration.
        </p>
      ) : (
        <p>
          The globe lost its graphics connection, which can happen when a device runs low on memory.
          Trying to bring it back…
          {waited && (
            <>
              {' '}
              <button
                type="button"
                className="button button--link"
                onClick={() => window.location.reload()}
              >
                Reload the page
              </button>
            </>
          )}
        </p>
      )}
    </div>
  )
}
