import type { ThreeEvent } from '@react-three/fiber'
import { useCallback } from 'react'
import type { LonLat } from '../geo/coords'
import { vector3ToLonLat } from './coords3d'

/** Pointer travel (px) between press and release above which a click counts as a drag. */
const MAX_CLICK_DRAG_PX = 5

/** Click handler for the Earth mesh that reports the clicked point, ignoring drags. */
export function useGlobePicking(onPick?: (point: LonLat) => void) {
  return useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (!onPick || event.delta > MAX_CLICK_DRAG_PX) return
      event.stopPropagation()
      const local = event.object.worldToLocal(event.point.clone())
      onPick(vector3ToLonLat(local))
    },
    [onPick],
  )
}
