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
import { unlockedAt, unlockedBy } from '../game/profile/cosmetics'
import { recordOutcomes, recordSession, type RecordedSession } from '../game/profile/record'
import { loadPreferences, savePreferences, type Preferences } from '../game/profile/settings'
import type { Toast } from '../ui/Toasts'
import type { Route } from './router'
import type { AccountServices } from './useAccount'

/** What every screen and mode needs from the app. */
export interface AppServices {
  geo: GeoData
  profile: Profile
  recordOutcomes(outcomes: CountryOutcome[]): void
  /** Records a finished game; returns how it compares with the player's best. */
  finishSession(summary: SessionSummary): RecordedSession
  resetProfile(): void
  /** Replaces progress and settings, e.g. from a backup file. */
  restore(profile: Profile, preferences: Preferences): void
  setCosmetics(update: Partial<Cosmetics>): void
  preferences: Preferences
  setPreferences(update: Partial<Preferences>): void
  navigate(route: Route, options?: { replace?: boolean }): void
  /** The server session and cloud sync; `status` is `offline` without a server. */
  account: AccountServices
}

export const AppContext = createContext<AppServices | null>(null)

export function useApp(): AppServices {
  const services = useContext(AppContext)
  if (!services) throw new Error('useApp needs an AppContext provider')
  return services
}

/**
 * Profile and preferences, kept in React state and saved to browser storage on change. New
 * achievements, levels, looks and mastered countries are announced through `notify`.
 */
export function useStoredState(geo: GeoData | null, notify: (toast: Omit<Toast, 'id'>) => void) {
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
      recordOutcomes: (outcomes: CountryOutcome[]) => {
        const before = profileRef.current
        const next = recordOutcomes(before, outcomes, Date.now())
        commitProfile(next)
        for (const id of Object.keys(next.masteredAt)) {
          if (!(id in before.masteredAt) && geo) {
            notify({
              icon: 'check',
              title: `${geo.nameOf(id)} mastered`,
              text: 'Gold on your globe',
            })
          }
        }
      },
      finishSession: (summary: SessionSummary) => {
        if (!geo) throw new Error('Geography is not loaded yet')
        const recorded = recordSession(profileRef.current, summary, geo)
        commitProfile(recorded.profile)
        for (const toast of rewardToasts(recorded)) notify(toast)
        return recorded
      },
      setCosmetics: (update: Partial<Cosmetics>) =>
        commitProfile({
          ...profileRef.current,
          cosmetics: { ...profileRef.current.cosmetics, ...update },
        }),
      restore: (restoredProfile: Profile, restoredPreferences: Preferences) => {
        commitProfile(restoredProfile)
        preferencesRef.current = restoredPreferences
        setPreferencesState(restoredPreferences)
        savePreferences(restoredPreferences)
      },
      adoptProfile: commitProfile,
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
    [profile, preferences, commitProfile, geo, notify],
  )
}

/** Notices for what a finished game earned: achievements, a new level, and new looks. */
function rewardToasts(recorded: RecordedSession): Omit<Toast, 'id'>[] {
  const toasts: Omit<Toast, 'id'>[] = recorded.achievements.map((achievement) => ({
    icon: 'trophy',
    title: achievement.title,
    text: achievement.description,
  }))
  for (const goal of recorded.goals) {
    toasts.push({ icon: 'check', title: 'Weekly goal done', text: `${goal.text} · +${goal.xp} XP` })
  }
  if (recorded.levelAfter > recorded.levelBefore) {
    toasts.push({ icon: 'star', title: `Level ${recorded.levelAfter}!` })
  }
  const levels = Array.from(
    { length: recorded.levelAfter - recorded.levelBefore },
    (_, i) => recorded.levelBefore + i + 1,
  )
  const looks = [
    ...levels.flatMap(unlockedAt),
    ...unlockedBy(recorded.achievements.map((a) => a.id)),
  ]
  if (looks.length > 0) {
    toasts.push({
      icon: 'palette',
      title: 'New looks unlocked',
      text: `${looks.map((look) => look.label).join(', ')} · in your Passport`,
    })
  }
  return toasts
}
