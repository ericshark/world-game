import type { RecordedSession } from '../game/profile/record'

/** A finished game worth a fanfare: a beaten best, a new level or an achievement. */
export function celebrates(recorded: RecordedSession): boolean {
  return (
    (recorded.isPersonalBest && recorded.previousBest !== null) ||
    recorded.levelAfter > recorded.levelBefore ||
    recorded.achievements.length > 0
  )
}
