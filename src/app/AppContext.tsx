import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { GeoData } from '../geo/facts'
import { configureSound } from '../audio/sound'
import type { CountryOutcome, SessionSummary } from '../game/core/types'
import {
  clearProfile,
  emptyProfile,
  loadProfile,
  saveProfile,
  type Cosmetics,
  type Profile,
} from '../game/profile/profile'
import { recordOutcomes, recordSession, type RecordedSession } from '../game/profile/record'
import { loadPreferences, savePreferences, type Preferences } from '../game/profile/settings'
import type { Route } from './router'

/** What every screen and mode needs from the app. */
export interface AppServices {
  geo: GeoData
  profile: Profile
  recordOutcomes(outcomes: CountryOutcome[]): void
  /** Records a finished game; returns how it compares with the player's best. */
  finishSession(summary: SessionSummary): RecordedSession
  resetProfile(): void
  setCosmetics(update: Partial<Cosmetics>): void
  preferences: Preferences
  setPreferences(update: Partial<Preferences>): void
  navigate(route: Route, options?: { replace?: boolean }): void
}

export const AppContext = createContext<AppServices | null>(null)

export function useApp(): AppServices {
  const services = useContext(AppContext)
  if (!services) throw new Error('useApp needs an AppContext provider')
  return services
}

/** Profile and preferences, kept in React state and saved to browser storage on change. */
export function useStoredState(geo: GeoData | null) {
  const [profile, setProfile] = useState(() => loadProfile())
  const profileRef = useRef(profile)
  const [preferences, setPreferencesState] = useState(() => loadPreferences())
  const preferencesRef = useRef(preferences)

  const commitProfile = useCallback((next: Profile) => {
    profileRef.current = next
    setProfile(next)
    saveProfile(next)
  }, [])

  useEffect(
    () => configureSound({ enabled: preferences.sound, volume: preferences.volume }),
    [preferences.sound, preferences.volume],
  )

  return useMemo(
    () => ({
      profile,
      preferences,
      recordOutcomes: (outcomes: CountryOutcome[]) =>
        commitProfile(recordOutcomes(profileRef.current, outcomes, Date.now())),
      finishSession: (summary: SessionSummary) => {
        if (!geo) throw new Error('Geography is not loaded yet')
        const recorded = recordSession(profileRef.current, summary, geo)
        commitProfile(recorded.profile)
        return recorded
      },
      setCosmetics: (update: Partial<Cosmetics>) =>
        commitProfile({
          ...profileRef.current,
          cosmetics: { ...profileRef.current.cosmetics, ...update },
        }),
      resetProfile: () => {
        clearProfile()
        commitProfile(emptyProfile())
      },
      setPreferences: (update: Partial<Preferences>) => {
        const next = { ...preferencesRef.current, ...update }
        preferencesRef.current = next
        setPreferencesState(next)
        savePreferences(next)
      },
    }),
    [profile, preferences, commitProfile, geo],
  )
}
