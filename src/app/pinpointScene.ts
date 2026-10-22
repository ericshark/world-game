import type { LonLat } from '../geo/coords'
import { LOCAL_PLAYER } from '../game/core/types'
import type { PinpointState } from '../game/modes/pinpoint'
import {
  CLICKED_COLOR,
  CLICKED_PAINT,
  EMPTY_SCENE,
  TARGET_COLOR,
  TARGET_PAINT,
  type GlobeScene,
} from '../globe/scene'

/** The pin being placed, then the reveal: target in gold, the clicked place in coral. */
export function pinpointScene(state: PinpointState | null, draftPin: LonLat | null): GlobeScene {
  if (!state) return EMPTY_SCENE
  const { rounds } = state
  const result = rounds.phase === 'revealed' ? rounds.results[rounds.round][LOCAL_PLAYER] : null

  if (!result) {
    return { ...EMPTY_SCENE, pins: draftPin ? [{ at: draftPin, color: CLICKED_COLOR }] : [] }
  }

  const target = { id: result.targetId, ...TARGET_PAINT }
  if (result.kind === 'missed') return { ...EMPTY_SCENE, paints: [target] }

  const clicked =
    result.clickedId && result.clickedId !== result.targetId
      ? [{ id: result.clickedId, ...CLICKED_PAINT }]
      : []
  const missedBy = result.distanceKm > 0.5
  return {
    paints: [...clicked, target],
    pins: [
      { at: result.guess, color: CLICKED_COLOR },
      ...(missedBy ? [{ at: result.nearest, color: TARGET_COLOR }] : []),
    ],
    arcs: missedBy ? [{ from: result.guess, to: result.nearest }] : [],
  }
}
