// Builds public/data/cities.json from Natural Earth 1:10m populated places (public domain)
// plus the curated overrides in data/cities.json. Run with `npm run build:cities`.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { geoDistance } from 'd3-geo'
import mapshaper from 'mapshaper'

const SOURCE_URL =
  'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_populated_places_simple.zip'
const CACHE_DIR = '.cache'
const ZIP_PATH = `${CACHE_DIR}/ne_10m_populated_places_simple.zip`
const SHP_PATH = `${CACHE_DIR}/ne-places/ne_10m_populated_places_simple.shp`
const OUTPUT_PATH = 'public/data/cities.json'

const EARTH_RADIUS_KM = 6371
const MERGE_INTO_PARENT = { SOL: 'SOM', CYN: 'CYP', KAB: 'KAZ', USG: 'CUB' }

if (!existsSync(SHP_PATH)) {
  mkdirSync(CACHE_DIR, { recursive: true })
  console.log(`Downloading ${SOURCE_URL}`)
  execFileSync('curl', ['-sSLf', '-o', ZIP_PATH, SOURCE_URL], { stdio: 'inherit' })
  execFileSync('unzip', ['-o', '-q', ZIP_PATH, '-d', `${CACHE_DIR}/ne-places`], {
    stdio: 'inherit',
  })
}

const places = JSON.parse(readFileSync('data/places.json', 'utf8'))
const capitals = JSON.parse(readFileSync('data/capitals.json', 'utf8'))
const curation = JSON.parse(readFileSync('data/cities.json', 'utf8'))

const excludeSet = new Set(curation.exclude)
const includeList = curation.include

const raw = await mapshaper.applyCommands(`-i ${SHP_PATH} -o places.json format=json`)
const rows = JSON.parse(raw['places.json'])

const byMatchKey = new Map()
const candidates = []

for (const row of rows) {
  const countryId = MERGE_INTO_PARENT[row.adm0_a3] ?? row.adm0_a3
  if (!places[countryId]) continue

  const rawName = cleanSpaces(row.name || row.nameascii || '')
  const rawAscii = cleanSpaces(row.nameascii || row.name || '')
  if (!rawName || !rawAscii) continue

  const keyRaw = `${countryId}:${rawName}`
  const keyAscii = `${countryId}:${rawAscii}`
  if (excludeSet.has(keyRaw) || excludeSet.has(keyAscii)) continue
  if (row.adm0cap === 1) continue

  const countryCapitals = capitals[countryId] ?? []
  const isCapitalName = countryCapitals.some(
    (c) =>
      c.name.toLowerCase() === rawName.toLowerCase() ||
      c.name.toLowerCase() === rawAscii.toLowerCase(),
  )
  if (isCapitalName) continue

  const at = [round(row.longitude), round(row.latitude)]
  const minCapKm =
    countryCapitals.length === 0
      ? Infinity
      : Math.min(...countryCapitals.map((c) => geoDistance(at, c.at) * EARTH_RADIUS_KM))

  const displayName = curation.renames[keyRaw] ?? curation.renames[keyAscii] ?? cleanSpaces(rawName)
  const population = Math.max(0, Math.round(Number(row.pop_max) || 0))
  const scalerank = Number.isFinite(Number(row.scalerank)) ? Number(row.scalerank) : 10
  const worldcity = Number(row.worldcity) === 1
  const score =
    Math.log10(Math.max(10_000, population)) +
    (worldcity ? 0.9 : 0) +
    Math.max(0, 4 - scalerank) * 0.35

  const candidate = {
    id: `${countryId.toLowerCase()}-${slug(rawAscii)}`,
    name: displayName,
    countryId,
    at,
    population,
    score,
    minCapKm,
    keys: [keyRaw, keyAscii],
  }

  for (const k of candidate.keys) {
    const existing = byMatchKey.get(k)
    if (!existing || candidate.population > existing.population) byMatchKey.set(k, candidate)
  }
  candidates.push(candidate)
}

const picked = []
const pickedIds = new Set()
const usedNames = new Set()
const perCountry = new Map()

function tryAdd(city, allowNearCapital) {
  if (pickedIds.has(city.id)) return false
  if (!allowNearCapital && city.minCapKm < curation.minCapitalDistanceKm) return false
  const count = perCountry.get(city.countryId) ?? 0
  if (count >= curation.perCountryCap) return false
  const normalizedName = city.name.toLowerCase()
  if (usedNames.has(normalizedName)) return false
  const tooClose = picked.some(
    (other) =>
      other.countryId === city.countryId &&
      geoDistance(other.at, city.at) * EARTH_RADIUS_KM < curation.minCityDistanceKm,
  )
  if (tooClose) return false

  picked.push(city)
  pickedIds.add(city.id)
  usedNames.add(normalizedName)
  perCountry.set(city.countryId, count + 1)
  return true
}

for (const key of includeList) {
  const match = byMatchKey.get(key)
  if (!match) throw new Error(`Curated include city not found (or is a capital): ${key}`)
  if (!tryAdd(match, true)) {
    throw new Error(`Could not add curated include city (cap, collision, or spacing): ${key}`)
  }
}

const ranked = [...candidates].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
for (const candidate of ranked) {
  if (picked.length >= curation.targetCount) break
  tryAdd(candidate, false)
}

// Rank by prominence descending so difficulty 0 is most famous and 1 is least famous.
picked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
const denominator = Math.max(1, picked.length - 1)
const output = picked.map((city, index) => ({
  id: city.id,
  name: city.name,
  countryId: city.countryId,
  at: city.at,
  population: city.population,
  difficulty: round(index / denominator),
}))

mkdirSync('public/data', { recursive: true })
writeFileSync(OUTPUT_PATH, JSON.stringify({ cities: output }))

const byRegion = new Map()
for (const city of output) {
  const region = places[city.countryId].region
  byRegion.set(region, (byRegion.get(region) ?? 0) + 1)
}
const sizeKb = Math.round(readFileSync(OUTPUT_PATH).length / 1024)
console.log(
  `Wrote ${OUTPUT_PATH}: ${output.length} cities across ${perCountry.size} countries (${sizeKb} KB)`,
)
console.log('By region:', Object.fromEntries([...byRegion.entries()].sort()))

function cleanSpaces(text) {
  return String(text).replace(/\s+/g, ' ').trim()
}

function slug(text) {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function round(value) {
  return Math.round(value * 1e4) / 1e4
}
