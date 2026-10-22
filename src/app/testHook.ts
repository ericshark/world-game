import { useEffect } from 'react'
import type { LonLat } from '../geo/coords'

/**
 * Dev-only handle for end-to-end tests. Clicking an exact spot on a WebGL globe is unreliable,
 * so tests place pins by coordinates and then drive the real buttons.
 */
export interface TestHook {
  snapshot(): {
    view: string
    round: number | null
    phase: string | null
    targetId: string | null
    draftPin: LonLat | null
  }
  placePin(point: LonLat): void
  /** A point inside the current target, for a guaranteed hit. */
  targetPoint(): LonLat | null
}

declare global {
  interface Window {
    __worldGame?: TestHook
  }
}

export function useTestHook(hook: TestHook) {
  useEffect(() => {
    if (!import.meta.env.DEV) return
    window.__worldGame = hook
    return () => {
      delete window.__worldGame
    }
  })
}
