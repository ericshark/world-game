// Browser storage is a per-viewer convenience: it can be missing, full or blocked
// (private windows, disabled site data), so every access degrades to "nothing saved".

export type JsonStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function browserStorage(): JsonStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

export function readJson<T>(key: string, fallback: T, storage = browserStorage()): T {
  try {
    const raw = storage?.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown, storage = browserStorage()): void {
  try {
    storage?.setItem(key, JSON.stringify(value))
  } catch {
    // Not saving is acceptable; the game keeps working for this session.
  }
}

export function removeKey(key: string, storage = browserStorage()): void {
  try {
    storage?.removeItem(key)
  } catch {
    // See writeJson.
  }
}

/** Storage that lives only as long as the page or process; for checking data without saving it. */
export function memoryStorage(): JsonStorage {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}
