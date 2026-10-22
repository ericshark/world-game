import { createContext, useContext, useEffect, useState } from 'react'
import type { MotionPreference } from '../game/profile/settings'

/** True when animations should be skipped or shortened. */
export const ReducedMotionContext = createContext(false)

export function useReducedMotion(): boolean {
  return useContext(ReducedMotionContext)
}

/** Resolves the player's motion setting, following the system setting by default. */
export function useResolvedReducedMotion(preference: MotionPreference): boolean {
  const [systemReduced, setSystemReduced] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  )
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const onChange = () => setSystemReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return preference === 'system' ? systemReduced : preference === 'reduced'
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}
