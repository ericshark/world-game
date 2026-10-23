import type { LonLat } from '../../geo/coords'
import type { GeoData } from '../../geo/facts'
import { rarities, rarityTier, type RarityTier } from '../../game/core/categories'
import type { RoundsState } from '../../game/core/rounds'
import { LOCAL_PLAYER, type Challenge } from '../../game/core/types'
import {
  CLICKED_PAINT,
  CONTEXT_PAINT,
  EMPTY_SCENE,
  ownPin,
  QUESTION_PAINT,
  TARGET_AREA_PAINT,
  TARGET_COLOR,
  TARGET_PAINT,
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

/** What the globe shows during a round and at its reveal, for every kind of round. */
export function roundScene(
  rounds: RoundsState<Challenge> | null,
  draftPin: LonLat | null,
  geo: GeoData,
): GlobeScene {
  if (!rounds || rounds.phase === 'finished') return EMPTY_SCENE
  const challenge = rounds.challenges[rounds.round]
  const result = rounds.phase === 'revealed' ? rounds.results[rounds.round][LOCAL_PLAYER] : null

  if (!result) {
    if (challenge.kind === 'identify') {
      return { ...EMPTY_SCENE, paints: [{ id: challenge.countryId, ...QUESTION_PAINT }] }
    }
    return { ...EMPTY_SCENE, pins: draftPin ? [ownPin(draftPin)] : [] }
  }

  if (challenge.kind === 'category') {
    // Every accepted answer lights up in its rarity colour, with the player's on top.
    const answers = [...rarities(challenge.category, geo)].map(([id, rarity]) =>
      tierPaint(id, rarityTier(rarity)),
    )
    if (result.kind !== 'category') return { ...EMPTY_SCENE, paints: answers }
    const yours: CountryPaint = result.valid
      ? {
          id: result.answerId,
          fill: 'rgb(255 213 74 / 0.35)',
          stroke: TARGET_COLOR,
          lineWidth: 3.5,
        }
      : { id: result.answerId, ...CLICKED_PAINT, lineWidth: 3 }
    return {
      paints: [...answers.filter((p) => p.id !== result.answerId), yours],
      ...pinAndArc(result.guess, result.nearest, result.distanceKm > 0.5),
      pulses: result.valid ? [{ id: result.answerId, color: TARGET_COLOR }] : [],
    }
  }

  const targetId = challenge.countryId
  const neighbors = geo.factsOf(targetId).neighbors.map((id) => ({ id, ...CONTEXT_PAINT }))
  switch (result.kind) {
    case 'identify': {
      // Show where the named country really is, so a wrong answer still teaches something.
      const answered =
        result.answerId !== targetId ? [{ id: result.answerId, ...CLICKED_PAINT }] : []
      return {
        ...EMPTY_SCENE,
        paints: [...neighbors, ...answered, { id: targetId, ...TARGET_PAINT }],
        pulses: [{ id: targetId, color: TARGET_COLOR }],
      }
    }
    case 'locate':
    case 'capital': {
      const isCapital = result.kind === 'capital'
      const clicked =
        result.clickedId && result.clickedId !== targetId
          ? [{ id: result.clickedId, ...CLICKED_PAINT }]
          : []
      const target = { id: targetId, ...(isCapital ? TARGET_AREA_PAINT : TARGET_PAINT) }
      // A capital is a labelled city; a country pulses so even a tiny one is easy to spot.
      const capital = isCapital ? capitalNearest(geo, targetId, result.nearest) : null
      return {
        paints: [...neighbors, ...clicked, target],
        ...pinAndArc(result.guess, result.nearest, result.distanceKm > 0.5),
        markers: capital ? [{ at: capital.at, label: capital.name, kind: 'city' }] : [],
        pulses: isCapital ? [] : [{ id: targetId, color: TARGET_COLOR }],
      }
    }
    default:
      return { ...EMPTY_SCENE, paints: [...neighbors, { id: targetId, ...TARGET_PAINT }] }
  }
}

/** The player's pin and, when it missed, a pin on the answer with an arc between them. */
export function pinAndArc(
  guess: LonLat,
  answer: LonLat,
  missed: boolean,
): Pick<GlobeScene, 'pins' | 'arcs'> {
  return {
    pins: [ownPin(guess), ...(missed ? [{ at: answer, color: TARGET_COLOR }] : [])],
    arcs: missed ? [{ from: guess, to: answer, own: true }] : [],
  }
}

/** The capital a guess was measured against (countries with several accept any of them). */
function capitalNearest(geo: GeoData, countryId: string, nearest: LonLat) {
  const capitals = geo.factsOf(countryId).capitals
  const distance = (at: LonLat) => Math.hypot(at[0] - nearest[0], at[1] - nearest[1])
  return capitals.reduce((best, capital) =>
    distance(capital.at) < distance(best.at) ? capital : best,
  )
}

function tierPaint(id: string, tier: RarityTier): CountryPaint {
  const color = TIER_COLORS[tier]
  return { id, fill: `${color}40`, stroke: `${color}cc`, lineWidth: 1.5 }
}
