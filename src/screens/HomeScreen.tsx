import type { CSSProperties } from 'react'
import { useApp } from '../app/AppContext'
import { MODES } from '../app/modes'
import { useGlobeShift } from '../app/useLayoutShift'
import { Icon } from '../ui/Icon'

export function HomeScreen() {
  const { navigate, profile, geo } = useApp()
  useGlobeShift({ x: 0.14, y: 0 }, { x: 0, y: 0.2 })
  const found = Object.values(profile.countries).filter((skills) =>
    Object.values(skills).some((stats) => stats && stats.hits > 0),
  ).length

  return (
    <div className="screen screen--home">
      <section className="panel home" aria-labelledby="home-title">
        <h1 className="home__title" id="home-title">
          World Game
        </h1>
        <p className="home__tagline">Know the world. One borderless Earth, many ways to play.</p>

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
          <button type="button" className="link-tile" onClick={() => navigate({ name: 'stats' })}>
            <Icon name="chart" size={18} />
            <span>
              Your stats
              <small>
                {found} / {geo.playableIds.length} countries found
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
