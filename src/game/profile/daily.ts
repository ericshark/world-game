import type { Profile } from './profile'

/** The day the first Daily World was published (puzzle #1). */
export const DAILY_EPOCH = '2026-10-01'

/** Local calendar date as YYYY-MM-DD: everyone gets a new puzzle at their own midnight. */
export function localDateKey(time: number | Date): string {
  const date = new Date(time)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Puzzle number for a date key: #1 on the epoch day. */
export function dailyNumber(dateKey: string): number {
  const days =
    (Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${DAILY_EPOCH}T00:00:00Z`)) / 86_400_000
  return Math.round(days) + 1
}

export function dateKeyBefore(dateKey: string): string {
  const time = Date.parse(`${dateKey}T12:00:00Z`) - 86_400_000
  return new Date(time).toISOString().slice(0, 10)
}

export function dateKeyAfter(dateKey: string): string {
  const time = Date.parse(`${dateKey}T12:00:00Z`) + 86_400_000
  return new Date(time).toISOString().slice(0, 10)
}

/** A seven-day streak earns a freeze, and no more than this many are kept. */
export const MAX_STREAK_FREEZES = 2
export const STREAK_FREEZE_EVERY = 7

export interface StreakState {
  streak: number
  /** Freezes in hand: each covers one missed day without breaking the streak. */
  freezes: number
}

/**
 * The Daily Five streak, counted day by day from the first one played. Every seventh day in a
 * row earns a freeze (two at most), and a missed day uses one up instead of ending the streak.
 * It is worked out from the daily record each time, so nothing extra is stored. The streak
 * runs up to today if today's Five is done, and otherwise up to yesterday, so a streak is not
 * lost before today's puzzle has been played.
 */
export function streakState(profile: Profile, now: number): StreakState {
  const today = localDateKey(now)
  const played = (day: string) => Boolean(profile.daily[day]?.five)
  const first = Object.keys(profile.daily)
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day) && played(day))
    .sort()[0]
  if (!first) return { streak: 0, freezes: 0 }

  const last = played(today) ? today : dateKeyBefore(today)
  let streak = 0
  let freezes = 0
  for (let day = first; day <= last; day = dateKeyAfter(day)) {
    if (played(day)) {
      streak++
      if (streak % STREAK_FREEZE_EVERY === 0) freezes = Math.min(MAX_STREAK_FREEZES, freezes + 1)
    } else if (freezes > 0) {
      freezes--
    } else {
      streak = 0
    }
  }
  return { streak, freezes }
}

/** Consecutive days with a finished Daily Five, ending today (or yesterday), with freezes. */
export function dailyStreak(profile: Profile, now: number): number {
  return streakState(profile, now).streak
}
