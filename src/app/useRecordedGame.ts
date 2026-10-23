import { useCallback, useState } from 'react'
import { play } from '../audio/sound'
import type { SessionSummary } from '../game/core/types'
import type { RecordedSession } from '../game/profile/record'
import { useApp } from './AppContext'
import { celebrates } from './celebrate'
import type { DailyGame } from './daily/dailyGame'

/**
 * Records a finished game in the profile (history, bests, XP, achievements, the daily) and
 * keeps the result for the results screen.
 */
export function useRecordedGame({
  daily,
  finishSound = true,
}: {
  daily?: DailyGame
  /** Off for modes that already sounded the ending as it happened. */
  finishSound?: boolean
} = {}) {
  const { finishSession } = useApp()
  const [recorded, setRecorded] = useState<RecordedSession | null>(null)
  const record = useCallback(
    (summary: SessionSummary) => {
      const result = finishSession(daily ? { ...summary, daily: daily.record } : summary)
      setRecorded(result)
      if (celebrates(result)) play('best')
      else if (finishSound) play('finish')
      return result
    },
    [finishSession, daily, finishSound],
  )
  const clear = useCallback(() => setRecorded(null), [])
  return { recorded, record, clear }
}
