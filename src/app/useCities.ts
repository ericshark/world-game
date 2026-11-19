import { useCallback, useEffect, useState } from 'react'
import { loadCities, peekCities, type CityIndex } from '../geo/cities'

/** Lazy-loads `public/data/cities.json` once when needed, with retry on failure. */
export function useCities(enabled = true): {
  cities: CityIndex | null
  error: string | null
  retry: () => void
} {
  const [cities, setCities] = useState<CityIndex | null>(() => peekCities())
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled || peekCities()) return
    let active = true
    loadCities()
      .then((index) => {
        if (!active) return
        setCities(index)
        setError(null)
      })
      .catch((err: unknown) => {
        if (active) setError(String(err))
      })
    return () => {
      active = false
    }
  }, [enabled, attempt])

  const retry = useCallback(() => {
    setError(null)
    setAttempt((n) => n + 1)
  }, [])

  return { cities: cities ?? peekCities(), error, retry }
}
