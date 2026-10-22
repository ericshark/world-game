import { localDateKey } from '../game/profile/daily'

/**
 * Today's date key for the daily puzzles. In development `?date=YYYY-MM-DD` picks another day,
 * so tests and previews are repeatable.
 */
export function todayKey(now = Date.now()): string {
  if (import.meta.env.DEV) {
    const override = new URLSearchParams(window.location.search).get('date')
    if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return override
  }
  return localDateKey(now)
}

/** Milliseconds until the next local midnight, when a new daily puzzle appears. */
export function msUntilTomorrow(now = Date.now()): number {
  const tomorrow = new Date(now)
  tomorrow.setHours(24, 0, 0, 0)
  return tomorrow.getTime() - now
}
