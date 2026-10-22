import { useEffect, useState } from 'react'
import { useGlobeStage } from './globeStage'

const PHONE_QUERY = '(max-width: 640px)'

export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => window.matchMedia?.(PHONE_QUERY).matches ?? false)
  useEffect(() => {
    const query = window.matchMedia?.(PHONE_QUERY)
    if (!query) return
    const onChange = () => setPhone(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return phone
}

/**
 * Keeps the globe clear of a screen's panels: beside the home panel on desktop, above it on
 * phones. Resets when the screen closes.
 */
export function useGlobeShift(desktop: { x: number; y: number }, phone: { x: number; y: number }) {
  const stage = useGlobeStage()
  const isPhone = useIsPhone()
  const { x, y } = isPhone ? phone : desktop
  useEffect(() => {
    stage.setShift({ x, y })
    return () => stage.setShift({ x: 0, y: 0 })
  }, [stage, x, y])
}
