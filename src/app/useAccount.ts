import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Profile } from '../game/profile/profile'
import { ApiError } from '../net/api'
import {
  clearSyncMeta,
  loadSyncMeta,
  planSync,
  profileHash,
  saveSyncMeta,
} from '../net/profileSync'
import {
  deleteMyData,
  fetchCloudProfile,
  pushCloudProfile,
  requestMagicLink,
  saveNickname,
  signOut,
  startSession,
  verifyMagicLink,
  type CloudProfile,
  type Me,
} from '../net/session'

/** Saving waits for the player to pause, so a burst of changes is one upload. */
const SYNC_DELAY_MS = 2000

export interface AccountServices {
  /** `offline` means there is no game server; its features stay hidden. */
  status: 'checking' | 'offline' | 'ready'
  me: Me | null
  sync: 'idle' | 'syncing' | 'error'
  /** Both this device and the cloud hold different progress; the player must choose. */
  conflict: { local: Profile; cloud: Profile } | null
  /** Each returns an error message to show, or null on success. */
  setNickname(nickname: string): Promise<string | null>
  sendLink(email: string): Promise<string | null>
  redeemLink(token: string): Promise<string | null>
  signOut(): Promise<void>
  deleteData(): Promise<string | null>
  resolveConflict(keep: 'cloud' | 'device'): void
}

const messageOf = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong. Try again.'

/**
 * The server session, and the sync of the local profile with the signed-in account's cloud
 * copy. Signed-out players and servers that are not there simply skip all of it.
 */
export function useAccount(
  profile: Profile,
  adoptProfile: (profile: Profile) => void,
): AccountServices {
  const [status, setStatus] = useState<AccountServices['status']>('checking')
  const [me, setMe] = useState<Me | null>(null)
  const [sync, setSync] = useState<AccountServices['sync']>('idle')
  const [conflict, setConflict] = useState<AccountServices['conflict']>(null)
  const [cloudInConflict, setCloudInConflict] = useState<CloudProfile | null>(null)

  const profileRef = useRef(profile)
  const adoptRef = useRef(adoptProfile)
  useEffect(() => {
    profileRef.current = profile
    adoptRef.current = adoptProfile
  })
  const running = useRef(false)
  const again = useRef(false)
  // A signed-in player stands for their account, so its id keys the sync memory.
  const accountId = me?.account ? me.player.id : null

  useEffect(() => {
    startSession()
      .then((value) => {
        setMe(value)
        setStatus('ready')
      })
      .catch(() => setStatus('offline'))
  }, [])

  /** Brings the cloud and this device in step. */
  const runSync = useCallback(async () => {
    if (!accountId) return
    if (running.current) {
      again.current = true
      return
    }
    running.current = true
    setSync('syncing')
    try {
      do {
        again.current = false
        let cloud = await fetchCloudProfile()
        // Saving can lose a race with another device; then plan again against what it holds.
        for (let tries = 0; tries < 3; tries++) {
          const local = profileRef.current
          const plan = planSync({ accountId, meta: loadSyncMeta(), local, cloud })
          if (plan === 'conflict') {
            setConflict({ local, cloud: cloud.profile! })
            setCloudInConflict(cloud)
            setSync('idle')
            return
          }
          if (plan === 'adopt') {
            adoptRef.current(cloud.profile!)
            saveSyncMeta({ accountId, version: cloud.version, hash: profileHash(cloud.profile!) })
          } else if (plan === 'mark') {
            saveSyncMeta({ accountId, version: cloud.version, hash: profileHash(local) })
          } else if (plan === 'upload') {
            const result = await pushCloudProfile(local, cloud.version)
            if (!result.saved) {
              cloud = result.cloud
              continue
            }
            saveSyncMeta({ accountId, version: result.version, hash: profileHash(local) })
          }
          break
        }
      } while (again.current)
      setSync('idle')
    } catch {
      setSync('error')
    } finally {
      running.current = false
    }
  }, [accountId])

  // Sync on sign-in, then whenever the profile changes.
  useEffect(() => {
    if (!accountId || conflict) return
    const timer = window.setTimeout(() => void runSync(), SYNC_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [accountId, profile, conflict, runSync])

  return useMemo<AccountServices>(
    () => ({
      status,
      me,
      sync,
      conflict,
      async setNickname(nickname) {
        try {
          setMe(await saveNickname(nickname))
          return null
        } catch (error) {
          return messageOf(error)
        }
      },
      async sendLink(email) {
        try {
          await requestMagicLink(email)
          return null
        } catch (error) {
          return messageOf(error)
        }
      },
      async redeemLink(token) {
        try {
          setMe(await verifyMagicLink(token))
          return null
        } catch (error) {
          return messageOf(error)
        }
      },
      async signOut() {
        await signOut().catch(() => {})
        clearSyncMeta()
        setConflict(null)
        setMe(await startSession().catch(() => null))
      },
      async deleteData() {
        try {
          await deleteMyData()
          clearSyncMeta()
          setConflict(null)
          setMe(await startSession().catch(() => null))
          return null
        } catch (error) {
          return messageOf(error)
        }
      },
      resolveConflict(keep) {
        if (!conflict || !cloudInConflict || !accountId) return
        if (keep === 'cloud') {
          adoptProfile(conflict.cloud)
          saveSyncMeta({
            accountId,
            version: cloudInConflict.version,
            hash: profileHash(conflict.cloud),
          })
        } else {
          // Pretend we last saw the cloud's version; the next sync then sends this device's copy.
          saveSyncMeta({ accountId, version: cloudInConflict.version, hash: 'device' })
        }
        setConflict(null)
        setCloudInConflict(null)
      },
    }),
    [status, me, sync, conflict, cloudInConflict, accountId, adoptProfile],
  )
}
