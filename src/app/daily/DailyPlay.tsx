import { useEffect, useMemo, useState } from 'react'
import type { DailyPuzzle } from '../../game/core/types'
import { daily, dailySeed, dailyTwist } from '../../game/modes/daily'
import { dailyNumber, dailyStreak } from '../../game/profile/daily'
import { loadDailyProgress, saveDailyProgress } from '../../game/profile/dailyProgress'
import type { RecordedSession } from '../../game/profile/record'
import { dailyShareText } from '../../game/profile/share'
import { ApiError } from '../../net/api'
import { startRankedDaily } from '../../net/daily'
import { formatNumber } from '../../screens/format'
import { Sheet } from '../../ui/Sheet'
import { ShareButton } from '../../ui/ShareButton'
import { useApp } from '../AppContext'
import type { RemoteDaily } from '../useRemoteSession'
import { JourneyGame } from '../journey/JourneyGame'
import { MysteryGame } from '../mystery/MysteryGame'
import { RoundGame } from '../rounds/RoundGame'
import { bestStreak } from '../streaks'
import { todayKey } from '../today'
import { DAILY_HOW_TO, dailyRoundTip } from './howTo'
import type { DailyGame } from './dailyGame'

/**
 * Plays one of today's puzzles, once. With a game server the puzzle is ranked: the server holds
 * the secret seed and the score. Without one it is local practice, and says so.
 */
export function DailyPlay({ puzzle, onDone }: { puzzle: DailyPuzzle; onDone: () => void }) {
  const { account } = useApp()
  // The date is fixed when the puzzle opens, so playing across midnight stays on one puzzle.
  const [dateKey] = useState(() => todayKey())
  if (account.status === 'checking') return <Waiting onDone={onDone} />
  if (account.status === 'offline') {
    return <DailyGameView puzzle={puzzle} dateKey={dateKey} onDone={onDone} practice />
  }
  return <RankedDaily puzzle={puzzle} dateKey={dateKey} onDone={onDone} />
}

type Opening =
  | { kind: 'loading' }
  | { kind: 'ready'; reply: RankedDailyReply }
  | { kind: 'unreachable' }
  | { kind: 'failed'; message: string }

type RankedDailyReply = Awaited<ReturnType<typeof startRankedDaily>>

/** Opens the puzzle on the server, then plays it there. */
function RankedDaily({
  puzzle,
  dateKey,
  onDone,
}: {
  puzzle: DailyPuzzle
  dateKey: string
  onDone: () => void
}) {
  const [opening, setOpening] = useState<Opening>({ kind: 'loading' })
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    startRankedDaily(puzzle, dateKey)
      .then((reply) => current && setOpening({ kind: 'ready', reply }))
      .catch((error: unknown) => {
        if (!current) return
        // No server after all: practise offline rather than not at all.
        if (error instanceof ApiError && error.status === 0) setOpening({ kind: 'unreachable' })
        else setOpening({ kind: 'failed', message: error instanceof Error ? error.message : '' })
      })
    return () => {
      current = false
    }
  }, [puzzle, dateKey])

  switch (opening.kind) {
    case 'loading':
      return <Waiting onDone={onDone} />
    case 'unreachable':
      return <DailyGameView puzzle={puzzle} dateKey={dateKey} onDone={onDone} practice />
    case 'failed':
      return (
        <Sheet title="Today’s puzzle could not be opened" onClose={onDone}>
          <p className="sheet__text" role="alert">
            {opening.message || 'Something went wrong.'} Try again in a moment.
          </p>
        </Sheet>
      )
    case 'ready':
      if (opening.reply.status === 'finished') {
        return (
          <Sheet
            eyebrow={`Daily World #${opening.reply.number}`}
            title="You’ve played this one"
            onClose={onDone}
          >
            <p className="sheet__text">
              You scored {formatNumber(opening.reply.score ?? 0)} on this puzzle. A new one arrives
              at midnight.
            </p>
          </Sheet>
        )
      }
      return (
        <>
          <DailyGameView
            puzzle={puzzle}
            dateKey={dateKey}
            onDone={onDone}
            remote={{
              puzzle,
              dateKey,
              initial: opening.reply.view,
              onError: setProblem,
            }}
          />
          {problem && (
            <p className="daily-problem" role="alert">
              {problem}
            </p>
          )}
        </>
      )
  }
}

function Waiting({ onDone }: { onDone: () => void }) {
  return (
    <Sheet title="Opening today’s puzzle…" onClose={onDone}>
      <p className="sheet__text" role="status">
        One moment.
      </p>
    </Sheet>
  )
}

function DailyGameView({
  puzzle,
  dateKey,
  onDone,
  remote,
  practice,
}: {
  puzzle: DailyPuzzle
  dateKey: string
  onDone: () => void
  remote?: RemoteDaily
  /** Played here with no server: not ranked. */
  practice?: boolean
}) {
  const seed = dailySeed(dateKey, puzzle)
  const dailyGame = useMemo<DailyGame>(
    () => ({
      record: { dateKey, puzzle },
      share: (recorded) => <DailyShare dateKey={dateKey} recorded={recorded} />,
      saved: remote ? null : loadDailyProgress(dateKey, puzzle, seed),
      save: (state) => saveDailyProgress(dateKey, puzzle, state),
      remote,
    }),
    [dateKey, puzzle, seed, remote],
  )
  const number = dailyNumber(dateKey)

  return (
    <>
      {practice && <p className="practice-tag">Offline practice — not ranked</p>}
      <DailyPuzzleGame
        puzzle={puzzle}
        dateKey={dateKey}
        seed={seed}
        number={number}
        dailyGame={dailyGame}
        onDone={onDone}
      />
    </>
  )
}

function DailyPuzzleGame({
  puzzle,
  dateKey,
  seed,
  number,
  dailyGame,
  onDone,
}: {
  puzzle: DailyPuzzle
  dateKey: string
  seed: string
  number: number
  dailyGame: DailyGame
  onDone: () => void
}) {
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
          roundTip={dailyRoundTip}
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
