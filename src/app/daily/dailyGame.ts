import { useEffect, type ReactNode } from 'react'
import type { SessionSummary } from '../../game/core/types'
import type { RecordedSession } from '../../game/profile/record'
import type { RemoteDaily } from '../useRemoteSession'

/** What a game needs to know when it is one of the day's puzzles. */
export interface DailyGame {
  record: NonNullable<SessionSummary['daily']>
  /** Share panel for the results screen. */
  share: (recorded: RecordedSession) => ReactNode
  /** Today's unfinished attempt, to carry on from: a daily puzzle cannot be restarted. */
  saved: unknown
  save: (state: { seed: string }) => void
  /** Set when the server hosts the puzzle (a ranked daily); it then keeps the progress itself. */
  remote?: RemoteDaily
}

/** Saves a daily puzzle after every move, so leaving it part-way does not start it over. */
export function useSaveDailyProgress(daily: DailyGame | undefined, state: { seed: string } | null) {
  useEffect(() => {
    if (daily && !daily.remote && state) daily.save(state)
  }, [daily, state])
}
