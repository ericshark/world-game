import type { SessionSummary } from '../core/types'

/** Total XP needed to reach a level: 0, 200, 600, 1,200, 2,000… (a gentle, steady climb). */
export function xpForLevel(level: number): number {
  return 100 * level * (level - 1)
}

export function levelForXp(xp: number): number {
  let level = 1
  while (xpForLevel(level + 1) <= xp) level++
  return level
}

export const XP_PER_MASTERED = 20
export const XP_PER_ACHIEVEMENT = 50
export const XP_DAILY_BONUS = 50

/**
 * XP for a finished game: a base for playing plus up to 140 for performance, with bonuses for
 * newly mastered countries, achievements and the daily puzzles. Effort counts, but knowing the
 * world counts more.
 */
export function sessionXp(
  summary: SessionSummary,
  { newlyMastered, achievements }: { newlyMastered: number; achievements: number },
): number {
  const performance =
    summary.maxScore !== null && summary.maxScore > 0
      ? summary.score / summary.maxScore
      : Math.min(1.5, summary.score / 2000)
  return (
    60 +
    Math.round(140 * Math.max(0, performance)) +
    XP_PER_MASTERED * newlyMastered +
    XP_PER_ACHIEVEMENT * achievements +
    (summary.mode === 'daily' ? XP_DAILY_BONUS : 0)
  )
}
