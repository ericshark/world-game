import type { ReactNode } from 'react'
import type { SessionSummary } from '../../game/core/types'
import type { RecordedSession } from '../../game/profile/record'

/** What a game needs to know when it is one of the day's puzzles. */
export interface DailyGame {
  record: NonNullable<SessionSummary['daily']>
  /** Share panel for the results screen. */
  share: (recorded: RecordedSession) => ReactNode
}
