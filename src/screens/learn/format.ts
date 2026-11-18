const DAY_MS = 86_400_000

/** When something comes due, in words: "now", "later today", "tomorrow", "in 5 days". */
export function formatDue(dueAt: number, now: number): string {
  const days = Math.ceil((dueAt - now) / DAY_MS)
  if (dueAt <= now) return 'now'
  if (days <= 0) return 'later today'
  if (days === 1) return 'tomorrow'
  if (days < 14) return `in ${days} days`
  return `in ${Math.round(days / 7)} weeks`
}
