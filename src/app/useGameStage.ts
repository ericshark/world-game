import { useEffect } from 'react'
import { useGlobeStage } from './globeStage'
import { useGlobeShift } from './useLayoutShift'

/**
 * What every game screen does to the globe while it is open: stop the idle spin, pick the day
 * or night surface, and on phones lift the globe clear of the bottom panel.
 */
export function useGameStage({ night = false }: { night?: boolean } = {}) {
  const stage = useGlobeStage()
  useGlobeShift({ x: 0, y: 0 }, { x: 0, y: 0.06 })
  useEffect(() => {
    stage.setAutoRotate(false)
    stage.setSurface(night ? 'night' : 'day')
    return () => {
      stage.setAutoRotate(true)
      stage.setSurface('day')
    }
  }, [stage, night])
  return stage
}
