import { loadProfile, saveProfile, type Profile } from './profile'
import { loadPreferences, savePreferences, type Preferences } from './settings'
import { memoryStorage } from './storage'

const FORMAT = 'world-game-backup'

/** Progress and settings live only in this browser; a backup file carries them elsewhere. */
export function createBackup(profile: Profile, preferences: Preferences): string {
  return JSON.stringify({ format: FORMAT, version: 1, profile, preferences }, null, 2)
}

/**
 * Reads a backup file. Everything goes through the same checks as loading from storage, so a
 * damaged or hand-edited file cannot leave the profile in a broken state. Null if it is not a
 * World Game backup at all.
 */
export function readBackup(text: string): { profile: Profile; preferences: Preferences } | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (
    typeof data !== 'object' ||
    data === null ||
    (data as { format?: unknown }).format !== FORMAT
  ) {
    return null
  }
  const { profile, preferences } = data as { profile?: unknown; preferences?: unknown }
  const scratch = memoryStorage()
  saveProfile(profile as Profile, scratch)
  savePreferences(preferences as Preferences, scratch)
  return { profile: loadProfile(scratch), preferences: loadPreferences(scratch) }
}
