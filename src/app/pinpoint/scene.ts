import type { LonLat } from '../../geo/coords'
import type { GeoData } from '../../geo/facts'
import { LOCAL_PLAYER } from '../../game/core/types'
import type { PinpointState } from '../../game/modes/pinpoint'
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

/** What the globe shows during a Pinpoint round and at its reveal. */
export function pinpointScene(
  state: PinpointState | null,
  draftPin: LonLat | null,
  geo: GeoData,
): GlobeScene {
  if (!state || state.rounds.phase === 'finished') return EMPTY_SCENE
  const { rounds } = state
  const challenge = rounds.challenges[rounds.round]
  const result = rounds.phase === 'revealed' ? rounds.results[rounds.round][LOCAL_PLAYER] : null

  if (!result) {
    if (challenge.kind === 'identify') {
      return { ...EMPTY_SCENE, paints: [{ id: challenge.countryId, ...QUESTION_PAINT }] }
    }
    return { ...EMPTY_SCENE, pins: draftPin ? [{ at: draftPin, color: CLICKED_COLOR }] : [] }
  }

  const targetId = result.targetId
  const neighbors: CountryPaint[] = geo
    .factsOf(targetId)
    .neighbors.map((id) => ({ id, ...CONTEXT_PAINT }))

  switch (result.kind) {
    case 'missed':
      return { ...EMPTY_SCENE, paints: [...neighbors, { id: targetId, ...TARGET_PAINT }] }

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
    case 'category':
    case 'capital': {
      const isCapital = result.kind === 'capital'
      const clicked =
        result.clickedId && result.clickedId !== targetId
          ? [{ id: result.clickedId, ...CLICKED_PAINT }]
          : []
      const target = { id: targetId, ...(isCapital ? TARGET_AREA_PAINT : TARGET_PAINT) }
      // A capital is a point, so it always gets a pin; a country only when the guess missed.
      const showAnswerPin = isCapital || result.distanceKm > 0.5
      return {
        paints: [...neighbors, ...clicked, target],
        pins: [
          { at: result.guess, color: CLICKED_COLOR },
          ...(showAnswerPin ? [{ at: result.nearest, color: TARGET_COLOR }] : []),
        ],
        arcs: showAnswerPin ? [{ from: result.guess, to: result.nearest }] : [],
      }
    }
  }
}
