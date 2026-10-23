import { useMemo, useState } from 'react'
import type { DailyPuzzle } from '../../game/core/types'
import { daily, dailySeed, dailyTwist } from '../../game/modes/daily'
import { dailyNumber, dailyStreak } from '../../game/profile/daily'
import { loadDailyProgress, saveDailyProgress } from '../../game/profile/dailyProgress'
import type { RecordedSession } from '../../game/profile/record'
import { dailyShareText } from '../../game/profile/share'
import { ShareButton } from '../../ui/ShareButton'
import { JourneyGame } from '../journey/JourneyGame'
import { MysteryGame } from '../mystery/MysteryGame'
import { RoundGame } from '../rounds/RoundGame'
import { bestStreak } from '../streaks'
import { todayKey } from '../today'
import { DAILY_HOW_TO } from './howTo'
import type { DailyGame } from './dailyGame'

/** Plays one of today's puzzles, once. */
export function DailyPlay({ puzzle, onDone }: { puzzle: DailyPuzzle; onDone: () => void }) {
  // The date is fixed when the puzzle opens, so playing across midnight stays on one puzzle.
  const [dateKey] = useState(() => todayKey())
  const seed = dailySeed(dateKey, puzzle)
  const dailyGame = useMemo<DailyGame>(
    () => ({
      record: { dateKey, puzzle },
      share: (recorded) => <DailyShare dateKey={dateKey} recorded={recorded} />,
      saved: loadDailyProgress(dateKey, puzzle, seed),
      save: (state) => saveDailyProgress(dateKey, puzzle, state),
    }),
    [dateKey, puzzle, seed],
  )
  const number = dailyNumber(dateKey)

  switch (puzzle) {
    case 'five':
      return (
        <RoundGame
          rules={daily}
          config={{ dateKey }}
          seed={seed}
          mode={`Daily Five #${number}`}
          subtitle={dailyTwist(dateKey) === 'night' ? 'Night edition' : 'Daily World'}
          introKey="daily"
          howTo={DAILY_HOW_TO}
          night={dailyTwist(dateKey) === 'night'}
          roundTimeMs={null}
          suggestions
          daily={dailyGame}
          tiles={(results) => [
            { label: 'Correct', value: `${results.filter((r) => r.hit).length} / 5` },
            { label: 'Best streak', value: String(bestStreak(results)) },
            { label: 'Puzzle', value: `#${number}` },
          ]}
          onChangeSetup={onDone}
          onHome={onDone}
        />
      )
    case 'mystery':
      return (
        <MysteryGame
          config={{ difficulty: 'normal' }}
          seed={seed}
          daily={dailyGame}
          onChangeSetup={onDone}
          onHome={onDone}
        />
      )
    case 'route':
      return (
        <JourneyGame
          config={{ kind: 'quick', region: 'World' }}
          seed={seed}
          daily={dailyGame}
          onChangeSetup={onDone}
          onHome={onDone}
        />
      )
  }
}

function DailyShare({ dateKey, recorded }: { dateKey: string; recorded: RecordedSession }) {
  const day = recorded.profile.daily[dateKey] ?? {}
  const url = `${window.location.origin}${window.location.pathname}#/daily`
  // The streak as of the moment the puzzle was finished.
  const finishedAt = recorded.profile.history.at(-1)?.endedAt ?? 0
  const text = dailyShareText(dateKey, day, dailyStreak(recorded.profile, finishedAt), url)
  return (
    <div className="daily-share">
      <pre className="daily-share__text">{text}</pre>
      <ShareButton text={text} label="Share today's results" />
    </div>
  )
}
