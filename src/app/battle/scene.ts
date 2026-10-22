import type { LonLat } from '../../geo/coords'
import type { GeoData } from '../../geo/facts'
import { rarities, rarityTier } from '../../game/core/categories'
import type { BattleState } from '../../game/modes/battle'
import {
  CLICKED_COLOR,
  EMPTY_SCENE,
  QUESTION_PAINT,
  TARGET_AREA_PAINT,
  TARGET_COLOR,
  TARGET_PAINT,
  type CountryPaint,
  type GlobeScene,
} from '../../globe/scene'
import { TIER_COLORS } from '../rounds/scene'

/**
 * A battle round on the globe: your own pin while answering, then everyone's pins in their
 * colours, with arcs to the answer.
 */
export function battleScene(
  view: BattleState,
  me: string,
  draftPin: LonLat | null,
  geo: GeoData,
): GlobeScene {
  const { rounds, config } = view
  if (rounds.phase === 'finished') return EMPTY_SCENE
  const challenge = rounds.challenges[rounds.round]
  const colorOf = (id: string) => config.roster.find((p) => p.id === id)?.color ?? '#ffffff'

  if (rounds.phase === 'open') {
    if (challenge.kind === 'identify') {
      return { ...EMPTY_SCENE, paints: [{ id: challenge.countryId, ...QUESTION_PAINT }] }
    }
    const submitted = rounds.submissions[rounds.round][me]?.pin
    const pin = submitted ?? draftPin
    return { ...EMPTY_SCENE, pins: pin ? [{ at: pin, color: CLICKED_COLOR }] : [] }
  }

  const results = Object.entries(rounds.results[rounds.round])
  const paints: CountryPaint[] = []
  if (challenge.kind === 'category') {
    for (const [id, rarity] of rarities(challenge.category, geo)) {
      const color = TIER_COLORS[rarityTier(rarity)]
      paints.push({ id, fill: `${color}33`, stroke: `${color}99`, lineWidth: 1.5 })
    }
    for (const [player, result] of results) {
      if (result.kind === 'category') {
        paints.push({
          id: result.answerId,
          fill: 'rgb(0 0 0 / 0)',
          stroke: colorOf(player),
          lineWidth: 3,
        })
      }
    }
  } else {
    paints.push({
      id: challenge.countryId,
      ...(challenge.kind === 'capital' ? TARGET_AREA_PAINT : TARGET_PAINT),
    })
  }

  const pins = []
  const arcs = []
  for (const [player, result] of results) {
    if (!('guess' in result)) continue
    pins.push({ at: result.guess, color: player === me ? CLICKED_COLOR : colorOf(player) })
    if (result.distanceKm > 0.5) arcs.push({ from: result.guess, to: result.nearest })
  }
  if (challenge.kind === 'capital') {
    pins.push({ at: geo.factsOf(challenge.countryId).capitals[0].at, color: TARGET_COLOR })
  }
  return { paints, pins, arcs }
}
