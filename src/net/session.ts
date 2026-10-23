import { normalizeProfile, type Profile } from '../game/profile/profile'
import { api, ApiError } from './api'

/** Who the server says this browser is. */
export interface Me {
  player: { id: string; nickname: string | null }
  /** Present once signed in; progress then follows the player across devices. */
  account: { email: string | null } | null
  providers: { email: boolean; google: boolean; github: boolean }
}

export interface CloudProfile {
  /** 0 when nothing has been saved yet. */
  version: number
  profile: Profile | null
}

/** Starts (or resumes) this browser's session. Fails with status 0 when there is no server. */
export const startSession = () => api<Me>('/session', { method: 'POST', body: {} })

export const saveNickname = (nickname: string) =>
  api<Me>('/nickname', { method: 'PUT', body: { nickname } })

export const requestMagicLink = (email: string) =>
  api<{ ok: true }>('/auth/magic', { body: { email } })

export const verifyMagicLink = (token: string) => api<Me>('/auth/magic/verify', { body: { token } })

export const signOut = () => api<{ ok: true }>('/auth/signout', { body: {} })

export const deleteMyData = () => api<{ ok: true }>('/me', { method: 'DELETE' })

export async function fetchCloudProfile(): Promise<CloudProfile> {
  const data = await api<{ version: number; profile: unknown }>('/profile')
  return { version: data.version, profile: data.profile ? normalizeProfile(data.profile) : null }
}

export type PushResult = { saved: true; version: number } | { saved: false; cloud: CloudProfile }

/** Saves a profile if the cloud still holds `baseVersion`; otherwise returns what it holds. */
export async function pushCloudProfile(profile: Profile, baseVersion: number): Promise<PushResult> {
  try {
    const { version } = await api<{ version: number }>('/profile', {
      method: 'PUT',
      body: { baseVersion, profile },
    })
    return { saved: true, version }
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      const body = error.body as { version: number; profile: unknown }
      return {
        saved: false,
        cloud: { version: body.version, profile: normalizeProfile(body.profile) },
      }
    }
    throw error
  }
}
