import { useRef, useState, type CSSProperties } from 'react'
import { useApp } from '../app/AppContext'
import { MODES, type ModeInfo } from '../app/modes'
import { todayKey } from '../app/today'
import { useGlobeShift } from '../app/useLayoutShift'
import { TOUR_KEY } from '../game/modes/tutorial'
import { cosmeticById, TITLES } from '../game/profile/cosmetics'
import { dailyNumber, dailyStreak } from '../game/profile/daily'
import { nextGoal } from '../game/profile/goals'
import { countByMastery, explorerRank } from '../game/profile/mastery'
import { countDueReviews, worldKnowledge } from '../game/profile/review'
import { levelForXp } from '../game/profile/xp'
import { Icon } from '../ui/Icon'
import { useReducedMotion } from '../ui/motion'
import { formatNumber } from './format'

type HomeSection = 'learn' | 'daily' | 'play' | 'compete'

const SECTIONS: { key: HomeSection; label: string }[] = [
  { key: 'learn', label: 'Learn' },
  { key: 'daily', label: 'Daily' },
  { key: 'play', label: 'Play' },
  { key: 'compete', label: 'Compete' },
]

export function HomeScreen() {
  const { navigate, profile, geo, preferences } = useApp()
  const reducedMotion = useReducedMotion()
  useGlobeShift({ x: 0.14, y: 0 }, { x: 0, y: 0.2 })

  const [activeSection, setActiveSection] = useState<HomeSection>('learn')
  const panelRef = useRef<HTMLElement>(null)
  const learnRef = useRef<HTMLElement>(null)
  const dailyRef = useRef<HTMLElement>(null)
  const playRef = useRef<HTMLElement>(null)
  const competeRef = useRef<HTMLElement>(null)

  const counts = countByMastery(profile, geo.playableIds)
  const found = counts.found + counts.mastered
  const rank = explorerRank(counts.mastered)
  const title = cosmeticById(TITLES, profile.cosmetics.title)
  const showTour = profile.history.length === 0 && !preferences.seenIntros.includes(TOUR_KEY)
  const playModes = MODES.filter((m) => m.group === 'play')
  const featured = playModes[0]
  const otherPlayModes = playModes.slice(1)
  const battleMode = MODES.find((m) => m.group === 'compete')!

  const sectionRefs: Record<HomeSection, React.RefObject<HTMLElement | null>> = {
    learn: learnRef,
    daily: dailyRef,
    play: playRef,
    compete: competeRef,
  }

  const jumpTo = (section: HomeSection) => {
    setActiveSection(section)
    sectionRefs[section].current?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  const onScroll = () => {
    const panel = panelRef.current
    if (!panel) return
    const top = panel.scrollTop + 72
    let current: HomeSection = 'learn'
    for (const { key } of SECTIONS) {
      const el = sectionRefs[key].current
      if (el && el.offsetTop <= top) current = key
    }
    if (current !== activeSection) setActiveSection(current)
  }

  return (
    <div className="screen screen--home">
      <section
        ref={panelRef}
        className="panel home"
        aria-labelledby="home-title"
        onScroll={onScroll}
      >
        <header className="home__header">
          <div className="home__header-top">
            <h1 className="home__title" id="home-title">
              World Game
            </h1>
            <div className="home__utils">
              <button
                type="button"
                className="home-util"
                onClick={() => navigate({ name: 'passport' })}
                title={`${rank.title}${title.id !== 'none' ? ` · “${title.label}”` : ''}`}
              >
                <Icon name="globe" size={16} />
                <span>
                  <strong>Passport</strong>
                  <small>
                    Level {levelForXp(profile.xp)} · {found}/{geo.playableIds.length}
                  </small>
                </span>
              </button>
              <button
                type="button"
                className="home-util home-util--settings"
                onClick={() => navigate({ name: 'settings' })}
              >
                <Icon name="gear" size={16} />
                <span>Settings</span>
              </button>
            </div>
          </div>
          <p className="home__tagline">Know the world. One Earth, many ways to play.</p>
        </header>

        <nav className="home-nav" aria-label="Home sections">
          {SECTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`home-nav__item${activeSection === key ? ' is-active' : ''}`}
              aria-current={activeSection === key ? 'location' : undefined}
              onClick={() => jumpTo(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        {showTour ? <TourCard /> : <NextGoal />}

        <section
          ref={learnRef}
          id="home-learn"
          className="home-group"
          aria-labelledby="group-learn"
        >
          <h2 className="home-group__title" id="group-learn">
            Learn
          </h2>
          <LearnCard />
          <button
            type="button"
            className="home-subtile"
            onClick={() => navigate({ name: 'atlas' })}
          >
            <Icon name="borders" size={16} />
            <span>
              <strong>Explore the Atlas</strong>
              <small>Browse countries, capitals and major cities</small>
            </span>
          </button>
        </section>

        <section
          ref={dailyRef}
          id="home-daily"
          className="home-group"
          aria-labelledby="group-daily"
        >
          <h2 className="home-group__title" id="group-daily">
            Daily
          </h2>
          <DailyCard />
        </section>

        <section ref={playRef} id="home-play" className="home-group" aria-labelledby="group-play">
          <h2 className="home-group__title" id="group-play">
            Play
          </h2>
          <ModeTile
            mode={featured}
            featured
            onOpen={() => navigate({ name: 'setup', mode: featured.key })}
          />
          <div className="mode-grid mode-grid--compact">
            {otherPlayModes.map((mode) => (
              <ModeTile
                key={mode.key}
                mode={mode}
                onOpen={() => navigate({ name: 'setup', mode: mode.key })}
              />
            ))}
          </div>
        </section>

        <section
          ref={competeRef}
          id="home-compete"
          className="home-group"
          aria-labelledby="group-compete"
        >
          <h2 className="home-group__title" id="group-compete">
            Compete
          </h2>
          <ModeTile
            mode={battleMode}
            featured
            onOpen={() => navigate({ name: 'setup', mode: battleMode.key })}
          />
          <div className="home__links">
            <button
              type="button"
              className="link-tile"
              onClick={() => navigate({ name: 'online' })}
            >
              <Icon name="globe" size={18} />
              <span>
                Play online
                <small>Private rooms & duels</small>
              </span>
            </button>
            <button
              type="button"
              className="link-tile"
              onClick={() => navigate({ name: 'leaderboards' })}
            >
              <Icon name="trophy" size={18} />
              <span>
                Leaderboards
                <small>Daily, duel, all-time</small>
              </span>
            </button>
          </div>
        </section>

        <p className="home__legal">
          NASA Blue & Black Marble · Natural Earth · <a href="#/privacy">Privacy</a> ·{' '}
          <a href="#/credits">Credits</a>
        </p>
      </section>
      <footer className="credit">
        Imagery: NASA Blue Marble & Black Marble · Borders: Natural Earth ·{' '}
        <a href="#/privacy">Privacy</a> · <a href="#/credits">Credits</a>
      </footer>
    </div>
  )
}

function ModeTile({
  mode,
  featured = false,
  onOpen,
}: {
  mode: ModeInfo
  featured?: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      className={`mode-tile${featured ? ' mode-tile--featured' : ''}`}
      style={{ '--tile-accent': mode.accent } as CSSProperties}
      onClick={onOpen}
    >
      <span className="mode-tile__icon">
        <Icon name={mode.icon} size={featured ? 22 : 18} />
      </span>
      <span className="mode-tile__text">
        <span className="mode-tile__title">{mode.title}</span>
        <span className="mode-tile__tagline">{mode.tagline}</span>
      </span>
      <Icon name="play" size={15} />
    </button>
  )
}

/** The course: reviews that are waiting, or where to carry on. */
function LearnCard() {
  const { navigate, profile, geo } = useApp()
  const [now] = useState(() => Date.now())
  const due = countDueReviews(profile, now)
  const started =
    Object.keys(profile.countries).length > 0 || Object.keys(profile.places).length > 0
  return (
    <button
      type="button"
      className="daily-card daily-card--learn"
      onClick={() => navigate({ name: 'learn' })}
    >
      <span className="daily-card__icon">
        <Icon name="compass" size={22} />
      </span>
      <span className="mode-tile__text">
        <span className="daily-card__title">
          {started ? 'Continue learning' : 'Learn the world'}
        </span>
        <span className="mode-tile__tagline">
          {due > 0
            ? `${due} ${due === 1 ? 'review' : 'reviews'} due`
            : started
              ? `World knowledge ${Math.round(worldKnowledge(profile.countries, geo.playableIds) * 100)}% · next lesson ready`
              : 'Short lessons, then reviews that make it stick'}
        </span>
      </span>
    </button>
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

/** One reachable target, so every visit has something to aim for. */
function NextGoal() {
  const { navigate, profile, geo } = useApp()
  const goal = nextGoal(profile, geo)
  const text =
    goal.kind === 'region'
      ? `Find ${goal.left} more ${goal.left === 1 ? 'country' : 'countries'} to complete ${goal.region}`
      : goal.kind === 'rank'
        ? `Master ${goal.left} more ${goal.left === 1 ? 'country' : 'countries'} to become a ${goal.title}`
        : `${formatNumber(goal.xpLeft)} XP to reach level ${goal.level}`
  return (
    <button type="button" className="goal" onClick={() => navigate({ name: 'passport' })}>
      <Icon name="star" size={16} />
      <span>
        <span className="goal__label">Next goal</span> {text}
      </span>
    </button>
  )
}

/** New players are offered a short guided game before anything else. */
function TourCard() {
  const { navigate, preferences, setPreferences } = useApp()
  return (
    <div className="goal goal--tour">
      <Icon name="compass" size={16} />
      <button type="button" className="goal__main" onClick={() => navigate({ name: 'tour' })}>
        <span className="goal__label">New here?</span> Take the one-minute tour
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="No thanks"
        onClick={() => setPreferences({ seenIntros: [...preferences.seenIntros, TOUR_KEY] })}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}
