import { useState, type CSSProperties } from 'react'
import { useApp } from '../app/AppContext'
import { MODES } from '../app/modes'
import { todayKey } from '../app/today'
import { useGlobeShift } from '../app/useLayoutShift'
import { dailyNumber, dailyStreak } from '../game/profile/daily'
import { countByMastery, explorerRank } from '../game/profile/mastery'
import { levelForXp } from '../game/profile/xp'
import { Icon } from '../ui/Icon'

export function HomeScreen() {
  const { navigate, profile, geo } = useApp()
  useGlobeShift({ x: 0.14, y: 0 }, { x: 0, y: 0.2 })
  const counts = countByMastery(profile, geo.playableIds)
  const found = counts.found + counts.mastered
  const rank = explorerRank(counts.mastered)

  return (
    <div className="screen screen--home">
      <section className="panel home" aria-labelledby="home-title">
        <h1 className="home__title" id="home-title">
          World Game
        </h1>
        <p className="home__tagline">Know the world. One borderless Earth, many ways to play.</p>

        <DailyCard />

        <div className="mode-grid">
          {MODES.map((mode) => (
            <button
              key={mode.key}
              type="button"
              className="mode-tile"
              style={{ '--tile-accent': mode.accent } as CSSProperties}
              onClick={() => navigate({ name: 'setup', mode: mode.key })}
            >
              <span className="mode-tile__icon">
                <Icon name={mode.icon} size={22} />
              </span>
              <span className="mode-tile__text">
                <span className="mode-tile__title">{mode.title}</span>
                <span className="mode-tile__tagline">{mode.tagline}</span>
              </span>
              <Icon name="play" size={16} />
            </button>
          ))}
        </div>

        <nav className="home__links" aria-label="More">
          <button
            type="button"
            className="link-tile"
            onClick={() => navigate({ name: 'passport' })}
          >
            <Icon name="globe" size={18} />
            <span>
              {rank.title} · Level {levelForXp(profile.xp)}
              <small>
                Your World: {found} / {geo.playableIds.length} found
              </small>
            </span>
          </button>
          <button
            type="button"
            className="link-tile"
            onClick={() => navigate({ name: 'settings' })}
          >
            <Icon name="gear" size={18} />
            <span>
              Settings
              <small>Sound, motion, units</small>
            </span>
          </button>
        </nav>
      </section>
      <footer className="credit">
        Imagery: NASA Blue Marble & Black Marble · Borders: Natural Earth
      </footer>
    </div>
  )
}

/** Today's puzzles, front and centre: the reason to come back each day. */
function DailyCard() {
  const { navigate, profile } = useApp()
  const [now] = useState(() => Date.now())
  const dateKey = todayKey(now)
  const today = profile.daily[dateKey] ?? {}
  const done = [today.five, today.mystery, today.route].filter(Boolean).length
  const streak = dailyStreak(profile, now)
  return (
    <button type="button" className="daily-card" onClick={() => navigate({ name: 'daily' })}>
      <span className="daily-card__icon">
        <Icon name="calendar" size={22} />
      </span>
      <span className="mode-tile__text">
        <span className="daily-card__title">Daily World #{dailyNumber(dateKey)}</span>
        <span className="mode-tile__tagline">
          {done === 3
            ? 'All done for today. Come back tomorrow!'
            : today.five
              ? `${done} of 3 done · bonus puzzles waiting`
              : 'Today’s five rounds are ready'}
        </span>
      </span>
      {streak > 0 && (
        <span className="daily-card__streak" aria-label={`${streak}-day streak`}>
          <Icon name="flame" size={16} />
          {streak}
        </span>
      )}
    </button>
  )
}
