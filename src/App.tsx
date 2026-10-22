import { useEffect, useMemo, useState } from 'react'
import { AppContext, useStoredState, type AppServices } from './app/AppContext'
import { GlobeStageProvider } from './app/GlobeStage'
import { useRoute } from './app/router'
import { Routes } from './app/Routes'
import { cosmeticById, GLOWS, PIN_SKINS } from './game/profile/cosmetics'
import { loadGeoData, type GeoData } from './geo/facts'
import { LoadingOverlay } from './screens/LoadingOverlay'
import { ReducedMotionContext, useResolvedReducedMotion } from './ui/motion'

export default function App() {
  const [geo, setGeo] = useState<GeoData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [route, navigate] = useRoute()
  const stored = useStoredState(geo)
  const reducedMotion = useResolvedReducedMotion(stored.preferences.motion)

  useEffect(() => {
    loadGeoData()
      .then(setGeo)
      .catch((error: unknown) => setLoadError(String(error)))
  }, [])

  const services = useMemo<AppServices | null>(
    () => (geo ? { geo, navigate, ...stored } : null),
    [geo, navigate, stored],
  )

  return (
    <ReducedMotionContext.Provider value={reducedMotion}>
      <div className="app" data-reduced-motion={reducedMotion || undefined}>
        <GlobeStageProvider
          geo={geo}
          showGrid={stored.preferences.showGrid}
          pinColor={cosmeticById(PIN_SKINS, stored.profile.cosmetics.pin).color}
          glow={cosmeticById(GLOWS, stored.profile.cosmetics.glow).color}
        >
          {services && (
            <AppContext.Provider value={services}>
              <Routes route={route} />
            </AppContext.Provider>
          )}
        </GlobeStageProvider>
        <LoadingOverlay dataReady={geo !== null} error={loadError} />
      </div>
    </ReducedMotionContext.Provider>
  )
}
