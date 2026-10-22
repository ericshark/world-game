import type { LonLat } from '../../geo/coords'
import type { GeoData } from '../../geo/facts'
import { rarities, rarityTier, type RarityTier } from '../../game/core/categories'
import { LOCAL_PLAYER } from '../../game/core/types'
import type { RareEarthState } from '../../game/modes/rareEarth'
import {
  CLICKED_COLOR,
  CLICKED_PAINT,
  EMPTY_SCENE,
  TARGET_COLOR,
  type CountryPaint,
  type GlobeScene,
} from '../../globe/scene'

export const TIER_COLORS: Record<RarityTier, string> = {
  Common: '#cfd8e6',
  Uncommon: '#6be38a',
  Rare: '#5aa9ff',
  Exotic: '#b98aff',
  Legendary: '#ffb347',
}

/** Translucent fill in a tier's colour. */
function tierPaint(id: string, tier: RarityTier): CountryPaint {
  const color = TIER_COLORS[tier]
  return { id, fill: `${color}40`, stroke: `${color}cc`, lineWidth: 1.5 }
}

/**
 * The reveal: every accepted answer lights up in its rarity colour, so you see what else you
 * could have said, with your own answer outlined on top.
 */
export function rareEarthScene(
  state: RareEarthState | null,
  draftPin: LonLat | null,
  geo: GeoData,
): GlobeScene {
  if (!state || state.rounds.phase === 'finished') return EMPTY_SCENE
  const { rounds } = state
  if (rounds.phase === 'open') {
    return { ...EMPTY_SCENE, pins: draftPin ? [{ at: draftPin, color: CLICKED_COLOR }] : [] }
  }

  const { category } = rounds.challenges[rounds.round]
  const result = rounds.results[rounds.round][LOCAL_PLAYER]
  const tiers = rarities(category, geo)
  const answers = [...tiers].map(([id, rarity]) => tierPaint(id, rarityTier(rarity)))
  if (result.kind !== 'category') return { ...EMPTY_SCENE, paints: answers }

  const yours: CountryPaint = result.valid
    ? { id: result.answerId, fill: 'rgb(255 213 74 / 0.35)', stroke: TARGET_COLOR, lineWidth: 3.5 }
    : { id: result.answerId, ...CLICKED_PAINT, lineWidth: 3 }
  const placedAway = result.distanceKm > 0.5
  return {
    paints: [...answers.filter((p) => p.id !== result.answerId), yours],
    pins: [
      { at: result.guess, color: CLICKED_COLOR },
      ...(placedAway ? [{ at: result.nearest, color: TARGET_COLOR }] : []),
    ],
    arcs: placedAway ? [{ from: result.guess, to: result.nearest }] : [],
  }
}

/** Where to look at the reveal: across all the valid answers. */
export function answerPoints(state: RareEarthState, geo: GeoData): LonLat[] {
  const { category } = state.rounds.challenges[state.rounds.round]
  return [...category.valid, ...category.lenient].map((id) => geo.factsOf(id).label)
}
