import type { JsonStorage } from '../game/profile/storage'

/** In-memory stand-in for localStorage. */
export function memoryStorage(): JsonStorage {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}
