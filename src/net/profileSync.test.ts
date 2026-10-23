import { describe, expect, it } from 'vitest'
import { emptyProfile, type Profile } from '../game/profile/profile'
import { memoryStorage } from '../game/profile/storage'
import { hasProgress, loadSyncMeta, planSync, profileHash, saveSyncMeta } from './profileSync'

const played = (xp: number): Profile => ({ ...emptyProfile(), xp })
const none = { version: 0, profile: null }

describe('profile fingerprints', () => {
  it('ignore key order but notice changes', () => {
    const a = emptyProfile()
    const b = Object.fromEntries(Object.entries(a).reverse()) as unknown as Profile
    expect(profileHash(a)).toBe(profileHash(b))
    expect(profileHash(played(1))).not.toBe(profileHash(a))
  })

  it('tell played profiles from fresh ones', () => {
    expect(hasProgress(emptyProfile())).toBe(false)
    expect(hasProgress(played(10))).toBe(true)
  })
})

describe('sync plans', () => {
  const accountId = 'acc'
  const synced = (profile: Profile, version: number) => ({
    accountId,
    version,
    hash: profileHash(profile),
  })

  it('upload the first profile when the cloud is empty', () => {
    expect(planSync({ accountId, meta: null, local: played(5), cloud: none })).toBe('upload')
    expect(planSync({ accountId, meta: null, local: emptyProfile(), cloud: none })).toBe('noop')
  })

  it('take the cloud profile on a fresh device', () => {
    const cloud = { version: 3, profile: played(50) }
    expect(planSync({ accountId, meta: null, local: emptyProfile(), cloud })).toBe('adopt')
  })

  it('send this device’s progress to an empty cloud profile', () => {
    const cloud = { version: 1, profile: emptyProfile() }
    expect(planSync({ accountId, meta: null, local: played(5), cloud })).toBe('upload')
  })

  it('ask the player when both sides have different progress on first sign-in', () => {
    const cloud = { version: 3, profile: played(50) }
    expect(planSync({ accountId, meta: null, local: played(5), cloud })).toBe('conflict')
  })

  it('remember when both sides already agree', () => {
    const cloud = { version: 3, profile: played(5) }
    expect(planSync({ accountId, meta: null, local: played(5), cloud })).toBe('mark')
  })

  it('stay quiet when nothing changed', () => {
    const local = played(5)
    const cloud = { version: 2, profile: local }
    expect(planSync({ accountId, meta: synced(local, 2), local, cloud })).toBe('noop')
  })

  it('upload local changes made since the last sync', () => {
    const before = played(5)
    const cloud = { version: 2, profile: before }
    expect(planSync({ accountId, meta: synced(before, 2), local: played(9), cloud })).toBe('upload')
  })

  it('adopt a newer cloud profile when this device did not change', () => {
    const before = played(5)
    const cloud = { version: 3, profile: played(20) }
    expect(planSync({ accountId, meta: synced(before, 2), local: before, cloud })).toBe('adopt')
  })

  it('ask the player when both changed since the last sync', () => {
    const before = played(5)
    const cloud = { version: 3, profile: played(20) }
    expect(planSync({ accountId, meta: synced(before, 2), local: played(9), cloud })).toBe(
      'conflict',
    )
  })

  it('treat a different account as a first meeting', () => {
    const local = played(5)
    const meta = { ...synced(local, 4), accountId: 'someone-else' }
    const cloud = { version: 1, profile: played(80) }
    expect(planSync({ accountId, meta, local, cloud })).toBe('conflict')
  })

  it('restore a cloud profile that was reset', () => {
    const local = played(5)
    const cloud = { version: 1, profile: emptyProfile() }
    expect(planSync({ accountId, meta: synced(local, 6), local, cloud })).toBe('upload')
  })
})

describe('sync memory', () => {
  it('round-trips and ignores junk', () => {
    const storage = memoryStorage()
    expect(loadSyncMeta(storage)).toBeNull()
    saveSyncMeta({ accountId: 'a', version: 2, hash: 'h' }, storage)
    expect(loadSyncMeta(storage)).toEqual({ accountId: 'a', version: 2, hash: 'h' })
    storage.setItem('world-game:sync:v1', '{"accountId":5}')
    expect(loadSyncMeta(storage)).toBeNull()
  })
})
