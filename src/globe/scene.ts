import type { LonLat } from '../geo/coords'
import type { PinShape, TrailStyle } from '../game/profile/cosmetics'

/** A country drawn on the overlay. Later entries are drawn on top of earlier ones. */
export interface CountryPaint {
  id: string
  fill: string
  stroke: string
  lineWidth: number
}

export interface PinSpec {
  at: LonLat
  color: string
  /** The local player's own pin, drawn in the colour and shape they picked. */
  own?: boolean
  shape?: PinShape
}

export interface ArcSpec {
  from: LonLat
  to: LonLat
  color?: string
  /** Ends in an arrowhead, for pointing somewhere rather than joining two places. */
  arrow?: boolean
  /** From the local player's own pin, drawn in the trail they picked. */
  own?: boolean
  style?: TrailStyle
}

/** A labelled point: a capital or major city, or where a journey starts and ends. */
export interface MarkerSpec {
  at: LonLat
  label: string
  kind: 'city' | 'major' | 'start' | 'goal'
}

/** A country that briefly pulses to draw the eye, e.g. the answer as it is revealed. */
export interface PulseSpec {
  id: string
  color: string
}

/** Everything a mode wants drawn on the globe, derived from its state. */
export interface GlobeScene {
  paints: CountryPaint[]
  pins: PinSpec[]
  arcs: ArcSpec[]
  markers?: MarkerSpec[]
  pulses?: PulseSpec[]
}

export const EMPTY_SCENE: GlobeScene = { paints: [], pins: [], arcs: [] }

/** The local player's pin, wherever they placed it. */
export function ownPin(at: LonLat): PinSpec {
  return { at, color: CLICKED_COLOR, own: true }
}

/** The reveal colours every mode shares: gold for the answer, coral for the player's pick. */
export const TARGET_COLOR = '#ffd54a'
export const CLICKED_COLOR = '#ff6b6b'

export const TARGET_PAINT = { fill: 'rgb(255 213 74 / 0.42)', stroke: TARGET_COLOR, lineWidth: 3 }
export const CLICKED_PAINT = {
  fill: 'rgb(255 107 107 / 0.18)',
  stroke: CLICKED_COLOR,
  lineWidth: 2.5,
}
/** A country being asked about, before the answer is known. */
export const QUESTION_PAINT = { fill: 'rgb(255 255 255 / 0.16)', stroke: '#ffffff', lineWidth: 3 }
/** Context around the answer, such as its neighbours. */
export const CONTEXT_PAINT = {
  fill: 'rgb(255 255 255 / 0)',
  stroke: 'rgb(255 255 255 / 0.35)',
  lineWidth: 1.5,
}
/** The answer's country, faintly, when the answer is a point inside it (a capital). */
export const TARGET_AREA_PAINT = {
  fill: 'rgb(255 213 74 / 0.14)',
  stroke: 'rgb(255 213 74 / 0.6)',
  lineWidth: 1.5,
}
