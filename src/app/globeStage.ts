import { createContext, useContext, useEffect } from 'react'
import type { LonLat } from '../geo/coords'
import type { CameraView } from '../globe/framing'
import type { ViewShift } from '../globe/Globe'
import { EMPTY_SCENE, type GlobeScene } from '../globe/scene'
import type { Surface } from '../globe/textures'

/**
 * The one globe behind every screen. Screens and game modes direct it through this context
 * (what to draw, what a click does, where the camera goes) instead of mounting their own, so the
 * WebGL context and textures load once.
 */
export interface GlobeStage {
  setScene(scene: GlobeScene): void
  setSurface(surface: Surface): void
  setAutoRotate(autoRotate: boolean): void
  /** Forces the border lines on (or off) whatever the setting says; null follows the setting. */
  setBordersOverride(show: boolean | null): void
  /** Slides the globe aside, e.g. away from a panel. */
  setShift(shift: ViewShift): void
  flyTo(view: CameraView): void
  /** The point under the centre of the screen, for crosshair placement. */
  center(): LonLat | null
  pickRef: { current: ((point: LonLat) => void) | null }
}

export const GlobeStageContext = createContext<GlobeStage | null>(null)

export function useGlobeStage(): GlobeStage {
  const stage = useContext(GlobeStageContext)
  if (!stage) throw new Error('useGlobeStage needs a GlobeStageProvider')
  return stage
}

/** Draws the scene while the calling component is mounted. */
export function useStageScene(scene: GlobeScene) {
  const stage = useGlobeStage()
  useEffect(() => stage.setScene(scene))
  useEffect(() => () => stage.setScene(EMPTY_SCENE), [stage])
}

/** Routes globe clicks to the handler while mounted (null ignores clicks). */
export function useStagePicking(handler: ((point: LonLat) => void) | null) {
  const { pickRef } = useGlobeStage()
  useEffect(() => {
    pickRef.current = handler
  })
  useEffect(
    () => () => {
      pickRef.current = null
    },
    [pickRef],
  )
}
