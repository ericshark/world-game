import { readFileSync } from 'node:fs'
import { CountryIndex, type CountryCollection } from '../geo/countries'

/** The generated country data, read from disk for tests. */
export function loadTestCountries(): CountryIndex {
  const path = new URL('../../public/data/countries.json', import.meta.url)
  return new CountryIndex(JSON.parse(readFileSync(path, 'utf8')) as CountryCollection)
}
