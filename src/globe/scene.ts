import type { LonLat } from '../geo/coords'

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
}

export interface ArcSpec {
  from: LonLat
  to: LonLat
}

/** Everything a mode wants drawn on the globe, derived from its state. */
export interface GlobeScene {
  paints: CountryPaint[]
  pins: PinSpec[]
  arcs: ArcSpec[]
}

export const EMPTY_SCENE: GlobeScene = { paints: [], pins: [], arcs: [] }

/** The reveal colours every mode shares: gold for the answer, coral for the player's pick. */
export const TARGET_COLOR = '#ffd54a'
export const CLICKED_COLOR = '#ff6b6b'

export const TARGET_PAINT = { fill: 'rgb(255 213 74 / 0.42)', stroke: TARGET_COLOR, lineWidth: 3 }
export const CLICKED_PAINT = {
  fill: 'rgb(255 107 107 / 0.18)',
  stroke: CLICKED_COLOR,
  lineWidth: 2.5,
}
