import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppContext, useStoredState, type AppServices } from './app/AppContext'
import { GlobeStageProvider } from './app/GlobeStage'
import { useAccount } from './app/useAccount'
import { useRoute } from './app/router'
import { useKeyboardInset } from './app/useKeyboardInset'
import { Routes } from './app/Routes'
import { loadGeoData, type GeoData } from './geo/facts'
import { SyncConflictSheet } from './screens/account/SyncConflictSheet'
import { LoadingOverlay } from './screens/LoadingOverlay'
import { ReducedMotionContext, useResolvedReducedMotion } from './ui/motion'
import { Toasts } from './ui/Toasts'
import { useToasts } from './ui/useToasts'

export default function App() {
  const [geo, setGeo] = useState<GeoData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [globe, setGlobe] = useState({ progress: 0, ready: false })
  const onGlobeLoad = useCallback(
    (progress: number, ready: boolean) =>
      setGlobe((previous) =>
        previous.progress === progress && previous.ready === ready ? previous : { progress, ready },
      ),
    [],
  )
  const [route, navigate] = useRoute()
  const toasts = useToasts()
  useKeyboardInset()
  const stored = useStoredState(geo, toasts.push)
  const account = useAccount(stored.profile, stored.adoptProfile)
  const reducedMotion = useResolvedReducedMotion(stored.preferences.motion)

  useEffect(() => {
    loadGeoData()
      .then(setGeo)
      .catch((error: unknown) => setLoadError(String(error)))
  }, [])

  const services = useMemo<AppServices | null>(
    () => (geo ? { geo, navigate, account, ...stored } : null),
    [geo, navigate, account, stored],
  )

  return (
    <ReducedMotionContext.Provider value={reducedMotion}>
      <div className="app" data-reduced-motion={reducedMotion || undefined}>
        <GlobeStageProvider
          geo={geo}
          showGrid={stored.preferences.showGrid}
          looks={stored.profile.cosmetics}
          onLoad={onGlobeLoad}
        >
          {services && (
            <AppContext.Provider value={services}>
              <Routes route={route} />
              {account.conflict && (
                <SyncConflictSheet
                  local={account.conflict.local}
                  cloud={account.conflict.cloud}
                  onChoose={account.resolveConflict}
                />
              )}
            </AppContext.Provider>
          )}
        </GlobeStageProvider>
        <Toasts toasts={toasts.toasts} onDismiss={toasts.dismiss} />
        <LoadingOverlay dataReady={geo !== null} globe={globe} error={loadError} />
      </div>
    </ReducedMotionContext.Provider>
  )
}
