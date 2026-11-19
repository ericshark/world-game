import { readFileSync } from 'node:fs'
import { CityIndex, type CitiesFile } from '../geo/cities'
import { CountryIndex, type CountryCollection } from '../geo/countries'
import { GeoData, type FactsFile } from '../geo/facts'

/** The generated country data, read from disk for tests. */
export function loadTestCountries(): CountryIndex {
  return new CountryIndex(readData<CountryCollection>('countries.json'))
}

/** Shapes plus facts, as the game loads them. */
export function loadTestGeoData(): GeoData {
  return new GeoData(loadTestCountries(), readData<FactsFile>('facts.json'))
}

/** The curated major cities, read from disk for tests. */
export function loadTestCities(): CityIndex {
  return new CityIndex(readData<CitiesFile>('cities.json').cities)
}

function readData<T>(file: string): T {
  const path = new URL(`../../public/data/${file}`, import.meta.url)
  return JSON.parse(readFileSync(path, 'utf8')) as T
}
