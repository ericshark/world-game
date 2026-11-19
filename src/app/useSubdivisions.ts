import { useCallback, useEffect, useState } from 'react'
import {
  loadSubdivisionPack,
  peekSubdivisionPack,
  type SubPackId,
  type SubdivisionPack,
} from '../geo/subdivisions'

/** Lazy-loads a single country's state/province pack once when needed, with retry on failure. */
export function useSubdivisionPack(
  packId: SubPackId | null,
  enabled = true,
): {
  pack: SubdivisionPack | null
  error: string | null
  retry: () => void
} {
  const [pack, setPack] = useState<SubdivisionPack | null>(() =>
    packId ? peekSubdivisionPack(packId) : null,
  )
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled || !packId || peekSubdivisionPack(packId)) return
    let active = true
    loadSubdivisionPack(packId)
      .then((loaded) => {
        if (!active) return
        setPack(loaded)
        setError(null)
      })
      .catch((err: unknown) => {
        if (active) setError(String(err))
      })
    return () => {
      active = false
    }
  }, [packId, enabled, attempt])

  const retry = useCallback(() => {
    setError(null)
    setAttempt((n) => n + 1)
  }, [])

  const current = packId ? (pack?.countryId === packId ? pack : peekSubdivisionPack(packId)) : null
  return { pack: current, error, retry }
}

/** Lazy-loads multiple country state/province packs (e.g. for due reviews across packs). */
export function useSubdivisionPacks(
  packIds: readonly SubPackId[],
  enabled = true,
): {
  packs: Partial<Record<SubPackId, SubdivisionPack>> | null
  error: string | null
  retry: () => void
} {
  const uniqueIds = [...new Set(packIds)].sort()
  const key = uniqueIds.join(',')
  const [packs, setPacks] = useState<Partial<Record<SubPackId, SubdivisionPack>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled || !key) return
    const ids = key.split(',') as SubPackId[]
    if (ids.every((id) => peekSubdivisionPack(id) !== null)) return
    let active = true
    Promise.all(ids.map((id) => loadSubdivisionPack(id)))
      .then((loaded) => {
        if (!active) return
        const map: Partial<Record<SubPackId, SubdivisionPack>> = {}
        for (const p of loaded) map[p.countryId] = p
        setPacks(map)
        setError(null)
      })
      .catch((err: unknown) => {
        if (active) setError(String(err))
      })
    return () => {
      active = false
    }
  }, [key, enabled, attempt])

  const retry = useCallback(() => {
    setError(null)
    setAttempt((n) => n + 1)
  }, [])

  let resolved: Partial<Record<SubPackId, SubdivisionPack>> | null = null
  if (enabled) {
    if (uniqueIds.length === 0) {
      resolved = {}
    } else {
      const fromCache: Partial<Record<SubPackId, SubdivisionPack>> = {}
      let allCached = true
      for (const id of uniqueIds) {
        const p = packs?.[id] ?? peekSubdivisionPack(id)
        if (!p) {
          allCached = false
          break
        }
        fromCache[id] = p
      }
      if (allCached) resolved = fromCache
    }
  }

  return { packs: resolved, error, retry }
}
