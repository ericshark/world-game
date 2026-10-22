import { geoArea, geoBounds, geoContains } from 'd3-geo'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import type { LonLat } from './coords'

export const REGIONS = [
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'South America',
  'Oceania',
] as const
export type Region = (typeof REGIONS)[number]

export type PlaceStatus = 'un-member' | 'un-observer' | 'partially-recognized'

export interface CountryProperties {
  /** Natural Earth ADM0_A3 code. */
  id: string
  name: string
  /** Whether the game can ask for this place. Non-playable places are still clickable. */
  playable: boolean
  status: PlaceStatus | null
  region: Region | string
  /** Too small to click reliably at max zoom; gets a hit radius in scoring. */
  isMicro: boolean
}

export type CountryFeature = Feature<Polygon | MultiPolygon, CountryProperties>
export type CountryCollection = FeatureCollection<Polygon | MultiPolygon, CountryProperties>

interface IndexedCountry {
  feature: CountryFeature
  /** [[west, south], [east, north]]; west > east when the country crosses the antimeridian. */
  bounds: [[number, number], [number, number]]
}

export class CountryIndex {
  readonly features: CountryFeature[]
  private readonly indexed: IndexedCountry[]
  private readonly byId: Map<string, CountryFeature>

  constructor(collection: CountryCollection) {
    this.features = collection.features
    // Smallest first: simplification can erase an enclave's hole in its surrounding country
    // (Vatican City in Italy), so the smaller containing shape must win.
    this.indexed = collection.features
      .map((feature) => ({ feature, bounds: geoBounds(feature), area: geoArea(feature) }))
      .sort((a, b) => a.area - b.area)
    this.byId = new Map(collection.features.map((f) => [f.properties.id, f]))
  }

  get(id: string): CountryFeature | undefined {
    return this.byId.get(id)
  }

  get playable(): CountryFeature[] {
    return this.features.filter((f) => f.properties.playable)
  }

  /** The country containing the point, or null for open ocean. */
  countryAt(point: LonLat): CountryFeature | null {
    for (const { feature, bounds } of this.indexed) {
      if (inBounds(point, bounds) && geoContains(feature, point)) return feature
    }
    return null
  }
}

function inBounds([lon, lat]: LonLat, [[west, south], [east, north]]: IndexedCountry['bounds']) {
  if (lat < south || lat > north) return false
  return west <= east ? lon >= west && lon <= east : lon >= west || lon <= east
}
