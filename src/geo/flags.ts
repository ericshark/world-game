import type { GeoData } from './facts'

/** Where a country's flag is served from (built into public/flags by scripts/build-flags.mjs). */
export function flagUrl(geo: GeoData, id: string): string {
  return `${import.meta.env.BASE_URL}flags/${geo.factsOf(id).iso2.toLowerCase()}.svg`
}
