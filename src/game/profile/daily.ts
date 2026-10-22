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

/**
 * Consecutive days with a finished Daily Five, ending today (or yesterday, so a streak is not
 * lost before today's puzzle is played).
 */
export function dailyStreak(profile: Profile, now: number): number {
  let day = localDateKey(now)
  if (!profile.daily[day]?.five) day = dateKeyBefore(day)
  let streak = 0
  while (profile.daily[day]?.five) {
    streak++
    day = dateKeyBefore(day)
  }
  return streak
}
