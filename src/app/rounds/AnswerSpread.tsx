import type { GeoData } from '../../geo/facts'
import { rarities, type Category } from '../../game/core/categories'
import type { Crowd } from '../../game/modes/daily'
import { CROWD_MINIMUM } from '../../game/modes/daily'
import { TIER_COLORS } from './scene'

const RAREST_SHOWN = 3

/** After a category round: how many answers were accepted, the rarest, and the colour key. */
export function AnswerSpread({
  category,
  geo,
  crowd,
  named,
  estimated,
}: {
  category: Category
  geo: GeoData
  /** How other players answered today, once enough have. */
  crowd?: Crowd | null
  /** The country this player named. */
  named?: string | null
  /** Ranked, but too few answers so far: the rarity colours are estimates. */
  estimated?: boolean
}) {
  const popular = crowd
    ? Object.entries(crowd.percent)
        .filter(([id]) => category.valid.includes(id) || category.lenient.includes(id))
        .sort((a, b) => b[1] - a[1])[0]
    : undefined
  const ranked = [...rarities(category, geo)].sort((a, b) => b[1] - a[1])
  const accepted = category.valid.length + category.lenient.length
  return (
    <div className="spread">
      <p className="spread__line">
        {accepted} accepted answers · rarest:{' '}
        {ranked
          .slice(0, RAREST_SHOWN)
          .map(([id]) => geo.nameOf(id))
          .join(', ')}
      </p>
      {crowd && (
        <p className="spread__line" data-testid="crowd">
          {named && `${crowd.percent[named] ?? 0}% of players named ${geo.nameOf(named)}`}
          {named && popular && ' · '}
          {popular && `most popular: ${geo.nameOf(popular[0])} (${popular[1]}%)`}
          {` · ${crowd.total} players today`}
        </p>
      )}
      {estimated && !crowd && (
        <p className="spread__line">
          Rarity is an estimate until {CROWD_MINIMUM} players have answered today.
        </p>
      )}
      <ul className="spread__legend" aria-label="Rarity colours on the globe">
        {Object.entries(TIER_COLORS).map(([tier, color]) => (
          <li key={tier}>
            <span style={{ background: color }} />
            {tier}
          </li>
        ))}
      </ul>
    </div>
  )
}
