import { useEffect, useState, type CSSProperties } from 'react'
import type { DailyPuzzle } from '../../game/core/types'
import { dailySeed, dailyTwist } from '../../game/modes/daily'
import { dailyNumber, dateKeyBefore, streakState } from '../../game/profile/daily'
import { weekStatus } from '../../game/profile/weekly'
import { loadDailyProgress } from '../../game/profile/dailyProgress'
import { dailyShareText } from '../../game/profile/share'
import { formatNumber } from '../../screens/format'
import { Icon, type IconName } from '../../ui/Icon'
import { ShareButton } from '../../ui/ShareButton'
import { useApp } from '../AppContext'
import { useGlobeShift } from '../useLayoutShift'
import { msUntilTomorrow, todayKey } from '../today'

const CALENDAR_DAYS = 28
const DISTRIBUTION_BUCKETS = 5

const PUZZLES: { puzzle: DailyPuzzle; title: string; text: string; icon: IconName }[] = [
  {
    puzzle: 'five',
    title: 'Daily Five',
    text: 'Five rounds: find, name, think rare, capital, finale.',
    icon: 'calendar',
  },
  { puzzle: 'mystery', title: 'Mystery Country', text: 'Today’s hidden country.', icon: 'search' },
  {
    puzzle: 'route',
    title: 'Daily Route',
    text: 'Today’s journey across the world.',
    icon: 'compass',
  },
]

/** Today's three puzzles, the streak, and how past days went. */
export function DailyScreen({
  onPlay,
  onClose,
}: {
  onPlay: (puzzle: DailyPuzzle) => void
  onClose: () => void
}) {
  const { profile, account, geo } = useApp()
  const [now, setNow] = useState(() => Date.now())
  useGlobeShift({ x: 0.14, y: 0 }, { x: 0, y: 0.25 })
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(interval)
  }, [])

  const dateKey = todayKey(now)
  const today = profile.daily[dateKey] ?? {}
  const { streak, freezes } = streakState(profile, now)
  const goals = weekStatus(profile, geo, now)
  const twist = dailyTwist(dateKey)
  const left = msUntilTomorrow(now)
  const doneAny = Boolean(today.five || today.mystery || today.route)
  const url = `${window.location.origin}${window.location.pathname}#/daily`

  return (
    <div className="screen screen--home">
      <section className="panel home daily" aria-labelledby="daily-title">
        <header className="passport__header">
          <div>
            <p className="eyebrow">Daily World #{dailyNumber(dateKey)}</p>
            <h1 className="passport__rank" id="daily-title">
              {new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </h1>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <p className="daily__meta">
          {streak > 0 && (
            <span className="daily__streak">
              <Icon name="flame" size={16} /> {streak}-day streak
            </span>
          )}
          {freezes > 0 && (
            <span
              className="tag"
              title="A freeze covers one missed day. Every 7th day in a row earns one."
            >
              {freezes} streak {freezes === 1 ? 'freeze' : 'freezes'}
            </span>
          )}
          <span>
            New puzzles in {Math.floor(left / 3_600_000)} h{' '}
            {Math.floor((left % 3_600_000) / 60_000)} m
          </span>
          {twist === 'night' && <span className="tag">Night edition</span>}
          {twist === 'micro' && <span className="tag">Micro-state finale</span>}
        </p>

        {account.status === 'offline' && (
          <p className="field__hint">
            There is no game server here, so dailies are offline practice and are not ranked.
          </p>
        )}

        <div className="mode-grid daily__puzzles">
          {PUZZLES.map(({ puzzle, title, text, icon }) => {
            const result = today[puzzle]
            const started =
              !result && loadDailyProgress(dateKey, puzzle, dailySeed(dateKey, puzzle))
            return (
              <button
                key={puzzle}
                type="button"
                className={`mode-tile${result ? ' is-done' : ''}`}
                style={
                  { '--tile-accent': puzzle === 'five' ? '#ffd54a' : '#5aa9ff' } as CSSProperties
                }
                disabled={Boolean(result)}
                onClick={() => onPlay(puzzle)}
              >
                <span className="mode-tile__icon">
                  <Icon name={result ? 'check' : icon} size={22} />
                </span>
                <span className="mode-tile__text">
                  <span className="mode-tile__title">{title}</span>
                  <span className="mode-tile__tagline">
                    {result
                      ? `Done · ${formatNumber(result.score)} points`
                      : started
                        ? 'In progress · carry on where you left off'
                        : text}
                  </span>
                </span>
                {!result && <Icon name="play" size={16} />}
              </button>
            )
          })}
        </div>

        {doneAny && (
          <div className="daily-share">
            <ShareButton text={dailyShareText(dateKey, today, streak, url)} label="Share today" />
          </div>
        )}

        <section className="weekly" aria-labelledby="weekly-title">
          <h2 className="field__label" id="weekly-title">
            Goals this week
          </h2>
          <ul className="weekly__list">
            {goals.map(({ goal, progress, done }) => (
              <li key={goal.id} className={done ? 'is-done' : undefined}>
                <span>
                  {done && <Icon name="check" size={14} />} {goal.text}
                </span>
                <span className="weekly__xp">
                  {done ? 'Done' : `${progress} / ${goal.target}`} · +{goal.xp} XP
                </span>
              </li>
            ))}
          </ul>
        </section>

        <Calendar dateKey={dateKey} />
        <Distribution />
      </section>
    </div>
  )
}

/** The last four weeks: one square per day, brighter for better Daily Five scores. */
function Calendar({ dateKey }: { dateKey: string }) {
  const { profile } = useApp()
  const days: string[] = []
  let day = dateKey
  for (let i = 0; i < CALENDAR_DAYS; i++) {
    days.unshift(day)
    day = dateKeyBefore(day)
  }
  return (
    <div className="field">
      <p className="field__label">Last four weeks</p>
      <ol className="calendar">
        {days.map((key) => {
          const score = profile.daily[key]?.five?.score
          const level = score === undefined ? 0 : 1 + Math.min(3, Math.floor(score / 1250))
          return (
            <li
              key={key}
              className={`calendar__day level-${level}${key === dateKey ? ' is-today' : ''}`}
              aria-label={
                score === undefined ? `${key}: not played` : `${key}: ${formatNumber(score)} points`
              }
              title={score === undefined ? `${key}: not played` : `${key}: ${formatNumber(score)}`}
            />
          )
        })}
      </ol>
    </div>
  )
}

/** How your Daily Five scores spread, in bands of 1,000. */
function Distribution() {
  const { profile } = useApp()
  const scores = Object.values(profile.daily).flatMap((day) => (day.five ? [day.five.score] : []))
  if (scores.length === 0) return null
  const buckets = Array.from({ length: DISTRIBUTION_BUCKETS }, () => 0)
  for (const score of scores)
    buckets[Math.min(DISTRIBUTION_BUCKETS - 1, Math.floor(score / 1000))]++
  const most = Math.max(...buckets)
  return (
    <div className="field">
      <p className="field__label">Your Daily Five scores ({scores.length} played)</p>
      <ul className="distribution">
        {buckets.map((count, i) => (
          <li key={i}>
            <span className="distribution__label">
              {i * 1000}–{i === DISTRIBUTION_BUCKETS - 1 ? '5,000' : `${i * 1000 + 999}`}
            </span>
            <span className="distribution__bar" style={{ width: `${(count / most) * 100}%` }} />
            <span className="distribution__count">{count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
