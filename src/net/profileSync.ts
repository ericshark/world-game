import type { Profile } from '../game/profile/profile'
import { readJson, removeKey, writeJson, type JsonStorage } from '../game/profile/storage'

const SYNC_KEY = 'world-game:sync:v1'

/** What this device last agreed with the cloud: which account, which version, which content. */
export interface SyncMeta {
  accountId: string
  version: number
  hash: string
}

export function loadSyncMeta(storage?: JsonStorage): SyncMeta | null {
  const saved = readJson<Partial<SyncMeta> | null>(SYNC_KEY, null, storage)
  return saved &&
    typeof saved.accountId === 'string' &&
    typeof saved.version === 'number' &&
    typeof saved.hash === 'string'
    ? { accountId: saved.accountId, version: saved.version, hash: saved.hash }
    : null
}

export function saveSyncMeta(meta: SyncMeta, storage?: JsonStorage) {
  writeJson(SYNC_KEY, meta, storage)
}

export function clearSyncMeta(storage?: JsonStorage) {
  removeKey(SYNC_KEY, storage)
}

/** JSON with sorted keys, so the same content always gives the same text. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** A short fingerprint of a profile's content (FNV-1a), to tell whether it changed. */
export function profileHash(profile: Profile): string {
  const text = canonical(profile)
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${(hash >>> 0).toString(16)}:${text.length}`
}

/** Whether there is anything worth keeping, as opposed to a fresh profile. */
export function hasProgress(profile: Profile): boolean {
  return (
    profile.xp > 0 ||
    profile.history.length > 0 ||
    Object.keys(profile.bests).length > 0 ||
    Object.keys(profile.countries).length > 0 ||
    Object.keys(profile.daily).length > 0 ||
    Object.keys(profile.achievements).length > 0
  )
}

export interface SyncSituation {
  accountId: string
  meta: SyncMeta | null
  local: Profile
  /** The cloud copy, with version 0 and a null profile when nothing is saved yet. */
  cloud: { version: number; profile: Profile | null }
}

/**
 * What to do about the device's and the cloud's copies:
 * - `noop`: already in step.
 * - `upload`: the cloud is behind (or empty); send this device's profile.
 * - `adopt`: this device is behind (or empty); take the cloud's profile.
 * - `mark`: both hold the same progress; just remember that.
 * - `conflict`: both changed on their own; the player chooses.
 */
export type SyncPlan = 'noop' | 'upload' | 'adopt' | 'mark' | 'conflict'

export function planSync({ accountId, meta, local, cloud }: SyncSituation): SyncPlan {
  const localHash = profileHash(local)
  const localHasProgress = hasProgress(local)

  if (cloud.profile === null) return localHasProgress ? 'upload' : 'noop'
  const cloudHash = profileHash(cloud.profile)

  if (meta?.accountId !== accountId) {
    // First time this device meets this account.
    if (cloudHash === localHash) return 'mark'
    if (!localHasProgress) return 'adopt'
    if (!hasProgress(cloud.profile)) return 'upload'
    return 'conflict'
  }

  const changedHere = localHash !== meta.hash
  if (cloud.version === meta.version) return changedHere ? 'upload' : 'noop'
  if (cloudHash === localHash) return 'mark'
  if (cloud.version > meta.version) return changedHere ? 'conflict' : 'adopt'
  // The cloud is older than what this device last saw: it was reset, so send ours back.
  return localHasProgress ? 'upload' : 'noop'
}
