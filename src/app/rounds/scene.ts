import type { LonLat } from '../../geo/coords'
import type { GeoData } from '../../geo/facts'
import { rarities, rarityTier, type RarityTier } from '../../game/core/categories'
import type { RoundsState } from '../../game/core/rounds'
import { LOCAL_PLAYER, type Challenge } from '../../game/core/types'
import {
  CLICKED_COLOR,
  CLICKED_PAINT,
  CONTEXT_PAINT,
  EMPTY_SCENE,
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
    return { ...EMPTY_SCENE, pins: draftPin ? [{ at: draftPin, color: CLICKED_COLOR }] : [] }
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
      // A capital is a point, so it always gets a pin; a country only when the guess missed.
      return {
        paints: [...neighbors, ...clicked, target],
        ...pinAndArc(result.guess, result.nearest, isCapital || result.distanceKm > 0.5),
      }
    }
    default:
      return { ...EMPTY_SCENE, paints: [...neighbors, { id: targetId, ...TARGET_PAINT }] }
  }
}

function pinAndArc(guess: LonLat, answer: LonLat, showAnswer: boolean): Omit<GlobeScene, 'paints'> {
  return {
    pins: [
      { at: guess, color: CLICKED_COLOR },
      ...(showAnswer ? [{ at: answer, color: TARGET_COLOR }] : []),
    ],
    arcs: showAnswer ? [{ from: guess, to: answer }] : [],
  }
}

function tierPaint(id: string, tier: RarityTier): CountryPaint {
  const color = TIER_COLORS[tier]
  return { id, fill: `${color}40`, stroke: `${color}cc`, lineWidth: 1.5 }
}
