import type { LonLat } from '../../geo/coords'
import type { GeoData } from '../../geo/facts'
import { rarities, rarityTier } from '../../game/core/categories'
import type { BattleState } from '../../game/modes/battle'
import {
  EMPTY_SCENE,
  ownPin,
  QUESTION_PAINT,
  TARGET_AREA_PAINT,
  TARGET_COLOR,
  TARGET_PAINT,
  type ArcSpec,
  type CountryPaint,
  type GlobeScene,
  type MarkerSpec,
  type PinSpec,
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
  const playerOf = (id: string) => config.roster.find((p) => p.id === id)
  const colorOf = (id: string) => playerOf(id)?.color ?? '#ffffff'

  if (rounds.phase === 'open') {
    if (challenge.kind === 'identify') {
      return { ...EMPTY_SCENE, paints: [{ id: challenge.countryId, ...QUESTION_PAINT }] }
    }
    const submitted = rounds.submissions[rounds.round][me]?.pin
    const pin = submitted ?? draftPin
    return { ...EMPTY_SCENE, pins: pin ? [ownPin(pin)] : [] }
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
      ...(challenge.kind === 'capital' || challenge.kind === 'city'
        ? TARGET_AREA_PAINT
        : TARGET_PAINT),
    })
  }

  // Everyone's pins in their scoreboard colours, so the reveal reads like the standings.
  const pins: PinSpec[] = []
  const arcs: ArcSpec[] = []
  for (const [player, result] of results) {
    if (!('guess' in result)) continue
    pins.push({ at: result.guess, color: colorOf(player), shape: playerOf(player)?.shape })
    if (result.distanceKm > 0.5) {
      arcs.push({ from: result.guess, to: result.nearest, color: colorOf(player) })
    }
  }
  const markers: MarkerSpec[] = []
  if (challenge.kind === 'capital') {
    const capital = geo.factsOf(challenge.countryId).capitals[0]
    markers.push({ at: capital.at, label: capital.name, kind: 'city' })
  } else if (challenge.kind === 'city') {
    markers.push({ at: challenge.at, label: challenge.name, kind: 'city' })
  }
  const pulses =
    challenge.kind === 'category' ? [] : [{ id: challenge.countryId, color: TARGET_COLOR }]
  return { paints, pins, arcs, markers, pulses }
}
