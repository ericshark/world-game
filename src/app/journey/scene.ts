import type { LonLat } from '../../geo/coords'
import type { GeoData } from '../../geo/facts'
import { connectionsFrom, type JourneyState } from '../../game/modes/journey'
import {
  CLICKED_PAINT,
  CONTEXT_PAINT,
  ownPin,
  TARGET_COLOR,
  type CountryPaint,
  type GlobeScene,
} from '../../globe/scene'

const ROUTE_PAINT = { fill: 'rgb(90 169 255 / 0.32)', stroke: '#5aa9ff', lineWidth: 2 }
const CURRENT_PAINT = { fill: 'rgb(90 169 255 / 0.55)', stroke: '#bfe0ff', lineWidth: 3 }
const DESTINATION_PAINT = { fill: 'rgb(255 213 74 / 0.22)', stroke: TARGET_COLOR, lineWidth: 3 }
const WAYPOINT_PAINT = { fill: 'rgb(185 138 255 / 0.12)', stroke: '#b98aff', lineWidth: 2 }
const FORBIDDEN_PAINT = {
  fill: 'rgb(255 107 107 / 0.1)',
  stroke: 'rgb(255 107 107 / 0.6)',
  lineWidth: 1.5,
}

/**
 * The journey so far: the route in blue with arcs between stops, the destination in gold,
 * waypoints in violet and no-go countries in red. Connections show while the hint is on.
 */
export function journeyScene(
  state: JourneyState,
  geo: GeoData,
  { draftPin, showConnections }: { draftPin: LonLat | null; showConnections: boolean },
): GlobeScene {
  const current = state.route.at(-1)!
  const label = (id: string) => geo.factsOf(id).label
  const lastStep = state.steps.at(-1)
  const paints: CountryPaint[] = [
    ...(state.rules.avoid ?? []).map((id) => ({ id, ...FORBIDDEN_PAINT })),
    ...(state.rules.visit?.ids ?? [])
      .filter((id) => !state.route.includes(id))
      .map((id) => ({ id, ...WAYPOINT_PAINT })),
    ...(showConnections && state.endedAt === null
      ? connectionsFrom(state, geo).map((link) => ({ id: link.to, ...CONTEXT_PAINT }))
      : []),
    ...state.route.slice(0, -1).map((id) => ({ id, ...ROUTE_PAINT })),
    { id: state.to, ...DESTINATION_PAINT },
    ...(lastStep?.kind === 'misstep' ? [{ id: lastStep.countryId, ...CLICKED_PAINT }] : []),
    { id: current, ...CURRENT_PAINT },
  ]
  return {
    paints,
    pins: draftPin ? [ownPin(draftPin)] : [],
    arcs: state.route
      .slice(1)
      .map((id, index) => ({ from: label(state.route[index]), to: label(id), color: '#bfe0ff' })),
    markers: [
      { at: label(state.from), label: geo.nameOf(state.from), kind: 'start' },
      { at: label(state.to), label: geo.nameOf(state.to), kind: 'goal' },
    ],
    // Each arrival pulses, so the eye follows the route as it grows.
    pulses: state.endedAt === null ? [{ id: current, color: '#bfe0ff' }] : [],
  }
}
