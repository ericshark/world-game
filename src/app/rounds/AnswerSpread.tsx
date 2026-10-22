import type { GeoData } from '../../geo/facts'
import { rarities, type Category } from '../../game/core/categories'
import { TIER_COLORS } from './scene'

const RAREST_SHOWN = 3

/** After a category round: how many answers were accepted, the rarest, and the colour key. */
export function AnswerSpread({ category, geo }: { category: Category; geo: GeoData }) {
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
