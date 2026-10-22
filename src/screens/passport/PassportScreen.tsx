import { useEffect, useState } from 'react'
import { useApp } from '../../app/AppContext'
import { useGlobeStage, useStagePicking, useStageScene } from '../../app/globeStage'
import { useGlobeShift } from '../../app/useLayoutShift'
import { REGIONS } from '../../geo/countries'
import { ACHIEVEMENTS } from '../../game/profile/achievements'
import { GLOWS, PIN_SKINS, type Cosmetic } from '../../game/profile/cosmetics'
import { dailyStreak } from '../../game/profile/daily'
import { countByMastery, explorerRank, masteryOf } from '../../game/profile/mastery'
import { levelForXp, xpForLevel } from '../../game/profile/xp'
import type { Skill } from '../../game/core/types'
import { frameCountry } from '../../globe/framing'
import { Choice } from '../../ui/controls'
import { FactCard } from '../../ui/FactCard'
import { Icon } from '../../ui/Icon'
import { formatDistance, formatNumber } from '../format'
import { CountryTable } from './CountryTable'
import { masteryPaint, MASTERY_STYLE } from './scene'

type Tab = 'regions' | 'countries' | 'achievements' | 'looks'

const SKILL_LABELS: Record<Skill, string> = {
  locate: 'Finding it',
  capital: 'Its capital',
  name: 'Naming it',
  recall: 'Rare Earth',
  visit: 'Journeys',
}

/**
 * Your World: the globe painted with every country you have seen, found and mastered, with
 * your rank, level, achievements and looks alongside.
 */
export function PassportScreen({ onClose }: { onClose: () => void }) {
  const app = useApp()
  const { geo, profile } = app
  const stage = useGlobeStage()
  const [tab, setTab] = useState<Tab>('regions')
  const [selected, setSelected] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
  useGlobeShift({ x: -0.15, y: 0 }, { x: 0, y: 0.22 })

  useEffect(() => {
    stage.setAutoRotate(false)
    return () => stage.setAutoRotate(true)
  }, [stage])

  useStagePicking((point) => {
    const id = geo.countries.countryAt(point)?.properties.id
    if (id && geo.playableIds.includes(id)) setSelected(id)
  })
  useStageScene({
    paints: geo.playableIds.flatMap((id) => {
      const mastery = masteryOf(profile.countries[id])
      const paint = mastery === 'unseen' ? [] : [masteryPaint(id, mastery)]
      return id === selected
        ? [...paint, { id, fill: 'rgb(255 255 255 / 0.12)', stroke: '#ffffff', lineWidth: 3 }]
        : paint
    }),
    pins: [],
    arcs: [],
  })

  const select = (id: string) => {
    setSelected(id)
    stage.flyTo(frameCountry(geo.feature(id), geo.factsOf(id).label))
  }

  const counts = countByMastery(profile, geo.playableIds)
  const rank = explorerRank(counts.mastered)
  const level = levelForXp(profile.xp)
  const floor = xpForLevel(level)
  const toNext = xpForLevel(level + 1) - profile.xp
  const progress = (profile.xp - floor) / (xpForLevel(level + 1) - floor)

  return (
    <div className="screen screen--passport">
      <section className="panel passport" aria-labelledby="passport-title">
        <header className="passport__header">
          <div>
            <p className="eyebrow">Your World</p>
            <h2 className="passport__rank" id="passport-title">
              {rank.title}
            </h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>

        <div className="passport__level">
          <span>Level {level}</span>
          <span className="xp-bar" aria-hidden="true">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
          <span className="passport__next">{formatNumber(toNext)} XP to go</span>
        </div>

        <div className="stat-tiles">
          {(['mastered', 'found', 'seen'] as const).map((mastery) => (
            <div className="tile" key={mastery}>
              <p className="tile__value" style={{ color: MASTERY_STYLE[mastery].color }}>
                {counts[mastery]}
              </p>
              <p className="tile__label">{MASTERY_STYLE[mastery].label}</p>
            </div>
          ))}
        </div>
        <p className="passport__hint">
          {rank.next
            ? `Master ${rank.next.at - counts.mastered} more countries to become a ${rank.next.title}.`
            : 'You have mastered the whole world.'}{' '}
          Daily streak: {dailyStreak(profile, now)}.
        </p>

        {selected ? (
          <CountryCard id={selected} onBack={() => setSelected(null)} />
        ) : (
          <>
            <Choice
              label="View"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'regions', label: 'Regions' },
                { value: 'countries', label: 'Countries' },
                { value: 'achievements', label: 'Awards' },
                { value: 'looks', label: 'Looks' },
              ]}
            />
            <div className="passport__body">
              {tab === 'regions' && <Regions onSelect={select} />}
              {tab === 'countries' && <CountryTable />}
              {tab === 'achievements' && <Achievements />}
              {tab === 'looks' && <Looks level={level} />}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function Regions({ onSelect }: { onSelect: (id: string) => void }) {
  const { geo, profile } = useApp()
  return (
    <ul className="regions">
      {REGIONS.map((region) => {
        const ids = geo.playableIds.filter((id) => geo.feature(id).properties.region === region)
        const counts = countByMastery(profile, ids)
        const share = (n: number) => `${(n / ids.length) * 100}%`
        // The best-known country you have not mastered yet: a good next target.
        const next = ids
          .filter((id) => masteryOf(profile.countries[id]) !== 'mastered')
          .sort((a, b) => geo.difficulty(a) - geo.difficulty(b))[0]
        return (
          <li key={region}>
            <div className="regions__head">
              <strong>{region}</strong>
              <span>
                {counts.mastered + counts.found} / {ids.length} found
              </span>
            </div>
            <span className="region-bar" aria-hidden="true">
              <span
                style={{ width: share(counts.mastered), background: MASTERY_STYLE.mastered.color }}
              />
              <span style={{ width: share(counts.found), background: MASTERY_STYLE.found.color }} />
              <span style={{ width: share(counts.seen), background: MASTERY_STYLE.seen.color }} />
            </span>
            {next && (
              <button type="button" className="button button--link" onClick={() => onSelect(next)}>
                Next to learn: {geo.nameOf(next)}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function CountryCard({ id, onBack }: { id: string; onBack: () => void }) {
  const { geo, profile, preferences } = useApp()
  const skills = profile.countries[id] ?? {}
  const mastery = masteryOf(skills)
  return (
    <div className="country-card">
      <button type="button" className="button button--link" onClick={onBack}>
        ← All regions
      </button>
      <h3 className="country-card__name">
        {geo.nameOf(id)}
        <span className="tag">
          {mastery === 'unseen' ? 'Not seen yet' : MASTERY_STYLE[mastery].label}
          {profile.masteredAt[id] && ` · ${new Date(profile.masteredAt[id]).toLocaleDateString()}`}
        </span>
      </h3>
      <ul className="country-card__skills">
        {Object.entries(skills).map(([skill, stats]) =>
          stats ? (
            <li key={skill}>
              <span>{SKILL_LABELS[skill as Skill]}</span>
              <span>
                {stats.hits} / {stats.attempts}
                {stats.totalKm > 0 &&
                  ` · avg ${formatDistance(stats.totalKm / stats.attempts, preferences.units)}`}
              </span>
            </li>
          ) : null,
        )}
      </ul>
      <FactCard geo={geo} id={id} units={preferences.units} />
    </div>
  )
}

function Achievements() {
  const { profile } = useApp()
  const unlocked = ACHIEVEMENTS.filter((a) => a.id in profile.achievements).length
  return (
    <>
      <p className="passport__hint">
        {unlocked} of {ACHIEVEMENTS.length} unlocked
      </p>
      <ul className="awards">
        {ACHIEVEMENTS.map((achievement) => {
          const at = profile.achievements[achievement.id]
          return (
            <li key={achievement.id} className={at ? 'is-unlocked' : undefined}>
              <Icon name="trophy" size={18} />
              <span>
                <strong>{achievement.title}</strong>
                {achievement.description}
              </span>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function Looks({ level }: { level: number }) {
  const { profile, setCosmetics } = useApp()
  return (
    <>
      <LookChoice
        label="Your pin"
        items={PIN_SKINS}
        selected={profile.cosmetics.pin}
        level={level}
        onSelect={(pin) => setCosmetics({ pin })}
      />
      <LookChoice
        label="Atmosphere"
        items={GLOWS}
        selected={profile.cosmetics.glow}
        level={level}
        onSelect={(glow) => setCosmetics({ glow })}
      />
    </>
  )
}

function LookChoice(props: {
  label: string
  items: Cosmetic[]
  selected: string
  level: number
  onSelect: (id: string) => void
}) {
  return (
    <div className="field">
      <p className="field__label">{props.label}</p>
      <div className="looks" role="radiogroup" aria-label={props.label}>
        {props.items.map((item) => {
          const locked = item.level > props.level
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={props.selected === item.id}
              disabled={locked}
              className="look"
              onClick={() => props.onSelect(item.id)}
              title={locked ? `Unlocks at level ${item.level}` : item.label}
            >
              <span className="look__swatch" style={{ background: item.color }} />
              {item.label}
              {locked && <small>Level {item.level}</small>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
