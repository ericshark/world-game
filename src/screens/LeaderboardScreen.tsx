import { useEffect, useState } from 'react'
import { useApp } from '../app/AppContext'
import { todayKey } from '../app/today'
import type { DailyPuzzle } from '../game/core/types'
import { fetchAllTimeBoard, fetchDailyBoard, fetchDuelBoard, type Board } from '../net/leaderboards'
import { Choice } from '../ui/controls'
import { Sheet } from '../ui/Sheet'
import { formatNumber } from './format'

type Tab = 'daily' | 'duel' | 'alltime'

const PUZZLE_LABELS: Record<DailyPuzzle, string> = {
  five: 'Daily Five',
  mystery: 'Mystery',
  route: 'Route',
}

type Loaded = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; board: Board }

/** Today's top players, the duel ladder and all-time averages. Real results only. */
export function LeaderboardScreen({ onClose }: { onClose: () => void }) {
  const { account } = useApp()
  const [tab, setTab] = useState<Tab>('daily')
  const [puzzle, setPuzzle] = useState<DailyPuzzle>('five')
  const [dateKey] = useState(() => todayKey())
  const [loaded, setLoaded] = useState<{ key: string; result: Loaded } | null>(null)
  const key = tab === 'daily' ? `daily:${puzzle}` : tab
  const online = account.status === 'ready'

  useEffect(() => {
    if (!online) return
    let current = true
    const request =
      tab === 'daily'
        ? fetchDailyBoard(puzzle, dateKey)
        : tab === 'duel'
          ? fetchDuelBoard()
          : fetchAllTimeBoard()
    request
      .then((board) => current && setLoaded({ key, result: { status: 'ready', board } }))
      .catch(() => current && setLoaded({ key, result: { status: 'failed' } }))
    return () => {
      current = false
    }
  }, [online, tab, puzzle, dateKey, key])

  const result: Loaded = loaded?.key === key ? loaded.result : { status: 'loading' }

  return (
    <Sheet eyebrow="World Game" title="Leaderboards" onClose={onClose} wide>
      {account.status === 'checking' ? (
        <p className="sheet__text" role="status">
          One moment.
        </p>
      ) : !online ? (
        <p className="sheet__text">
          Leaderboards need the game server, which is not available here. Dailies played without it
          are offline practice and are not ranked, so there is nothing to show.
        </p>
      ) : (
        <>
          <Choice
            label="Board"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'daily', label: 'Today' },
              { value: 'duel', label: 'Duel ladder' },
              { value: 'alltime', label: 'All-time' },
            ]}
          />
          {tab === 'daily' && (
            <Choice
              label="Puzzle"
              value={puzzle}
              onChange={setPuzzle}
              options={(Object.keys(PUZZLE_LABELS) as DailyPuzzle[]).map((value) => ({
                value,
                label: PUZZLE_LABELS[value],
              }))}
            />
          )}
          <BoardView tab={tab} result={result} />
        </>
      )}
    </Sheet>
  )
}

function BoardView({ tab, result }: { tab: Tab; result: Loaded }) {
  if (result.status === 'loading') {
    return (
      <p className="sheet__text" role="status">
        Loading…
      </p>
    )
  }
  if (result.status === 'failed') {
    return (
      <p className="sheet__text" role="alert">
        The leaderboard could not be loaded. Try again in a moment.
      </p>
    )
  }
  const { board } = result
  const unit = tab === 'duel' ? 'rating' : tab === 'alltime' ? 'average' : 'points'
  return (
    <div data-testid="leaderboard">
      {board.me ? (
        <p className="rating-line" data-testid="leaderboard-me">
          You are #{board.me.rank} of {board.total} with {formatNumber(board.me.value)} {unit}
          {tab === 'daily' &&
            board.me.percentile !== undefined &&
            ` · you beat ${board.me.percentile}% of players today`}
        </p>
      ) : (
        board.progress && (
          <p className="field__hint">
            Play {board.progress.need - board.progress.have} more{' '}
            {tab === 'duel' ? 'rated duels' : 'Daily Fives'} to be ranked ({board.progress.have} of{' '}
            {board.progress.need} so far).
          </p>
        )
      )}
      {board.rows.length === 0 ? (
        <p className="sheet__text">Nobody has been ranked here yet.</p>
      ) : (
        <ol className="board">
          {board.rows.map((row) => (
            <li key={row.rank} className={row.you ? 'is-you' : undefined}>
              <span className="board__rank">{row.rank}</span>
              <span className="board__name">
                {row.name}
                {row.you && ' (you)'}
              </span>
              <span className="board__value">
                {formatNumber(row.value)}
                {row.count !== undefined && <small> · {row.count} games</small>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
