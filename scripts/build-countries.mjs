// Builds public/data/countries.json (shapes) and public/data/facts.json (per-country facts the
// game modes use) from Natural Earth 1:10m admin-0 countries (public domain) plus the curated
// files in data/. Run with `npm run build:data`. Raw downloads are cached in .cache/.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { geoArea, geoBounds } from 'd3-geo'
import mapshaper from 'mapshaper'
import { borderDistanceMatrix } from './border-distances.mjs'

const SOURCE_URL = 'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip'
const CACHE_DIR = '.cache'
const ZIP_PATH = `${CACHE_DIR}/ne_10m_admin_0_countries.zip`
const SHP_PATH = `${CACHE_DIR}/ne10/ne_10m_admin_0_countries.shp`
const OUTPUT_PATH = 'public/data/countries.json'
const FACTS_PATH = 'public/data/facts.json'
const BORDERS_PATH = 'public/data/borders.json'

const EARTH_RADIUS_KM = 6371
// Countries smaller than this are hard to click at max zoom and get a hit radius in-game.
const MICRO_AREA_KM2 = 2500

// Breakaway or leased areas merged into the country they are usually shown as part of,
// so the reveal highlight has no holes.
const MERGE_INTO_PARENT = { SOL: 'SOM', CYN: 'CYP', KAB: 'KAZ', USG: 'CUB' }

// Natural Earth name fields offered as alternative answers when typing a country name.
const ALIAS_FIELDS = [
  'NAME',
  'NAME_LONG',
  'ADMIN',
  'FORMAL_EN',
  'NAME_ALT',
  'NAME_CIAWF',
  'NAME_EN',
]

if (!existsSync(SHP_PATH)) {
  mkdirSync(CACHE_DIR, { recursive: true })
  console.log(`Downloading ${SOURCE_URL}`)
  execFileSync('curl', ['-sSLf', '-o', ZIP_PATH, SOURCE_URL], { stdio: 'inherit' })
  execFileSync('unzip', ['-o', '-q', ZIP_PATH, '-d', `${CACHE_DIR}/ne10`], { stdio: 'inherit' })
}

const places = readJson('data/places.json')
const capitals = readJson('data/capitals.json')
const geography = readJson('data/geography.json')
const curatedAliases = readJson('data/aliases.json').aliases

const attributes = await readAttributes()
const mergeExpression = `ADM0_A3 = (${JSON.stringify(MERGE_INTO_PARENT)})[ADM0_A3] || ADM0_A3`
const output = await mapshaper.applyCommands(
  [
    `-i ${SHP_PATH}`,
    `-each '${mergeExpression}'`,
    '-dissolve ADM0_A3 copy-fields=NAME_LONG,CONTINENT',
    // Measured before simplification; mapshaper reports spherical m² for lon/lat data.
    "-each 'AREA_M2=this.area'",
    // Simplifying collapses atoll rings even with keep-shapes (Kiribati lost Tarawa), so
    // micro-states keep full detail. They are tiny, so this costs little.
    `-simplify variable percentage='AREA_M2 < ${MICRO_AREA_KM2 * 1e6} ? 1 : 0.12' weighted keep-shapes`,
    '-o countries.json format=geojson precision=0.0001',
    '-o countries.topojson format=topojson',
    // Shared land borders, each drawn once, from the very shapes used for hit-testing, so the
    // optional border lines on the globe match the reveal outlines exactly.
    '-innerlines + name=borders',
    '-o target=borders borders.json format=geojson precision=0.0001',
  ].join(' '),
)
const collection = JSON.parse(output['countries.json'])
const areaById = new Map(
  collection.features.map((f) => [f.properties.ADM0_A3, f.properties.AREA_M2]),
)

const missing = new Set(Object.keys(places))
const features = collection.features.map((feature) => {
  const id = feature.properties.ADM0_A3
  const place = places[id]
  missing.delete(id)

  // d3-geo treats a polygon whose rings wind the "wrong" way as covering the rest of the sphere.
  if (geoArea(feature) > 2 * Math.PI) reverseRings(feature.geometry)

  const areaKm2 = geoArea(feature) * EARTH_RADIUS_KM ** 2
  return {
    type: 'Feature',
    properties: {
      id,
      name: place?.name ?? feature.properties.NAME_LONG,
      playable: Boolean(place),
      status: place?.status ?? null,
      region: place?.region ?? feature.properties.CONTINENT,
      isMicro: areaKm2 < MICRO_AREA_KM2,
    },
    geometry: feature.geometry,
  }
})

if (missing.size > 0) {
  throw new Error(`Places with no geometry: ${[...missing].join(', ')}`)
}

mkdirSync('public/data', { recursive: true })
writeFileSync(OUTPUT_PATH, JSON.stringify({ type: 'FeatureCollection', features }))
writeFileSync(BORDERS_PATH, output['borders.json'])

const playable = features
  .filter((f) => f.properties.playable)
  .sort((a, b) => a.properties.id.localeCompare(b.properties.id))
const playableIds = new Set(playable.map((f) => f.properties.id))
const neighbors = sharedBorders(JSON.parse(output['countries.topojson']), playableIds)
const touching = new Set(
  Object.entries(neighbors).flatMap(([id, list]) => list.map((other) => `${id}|${other}`)),
)

const facts = {}
for (const feature of playable) {
  const { id } = feature.properties
  const row = attributes.get(id)
  const merged = Object.entries(MERGE_INTO_PARENT)
    .filter(([, parent]) => parent === id)
    .map(([child]) => attributes.get(child))
  const sum = (field) => [row, ...merged].reduce((total, r) => total + (Number(r[field]) || 0), 0)

  facts[id] = {
    iso2: row.ISO_A2_EH,
    subregion: row.SUBREGION,
    population: Math.round(sum('POP_EST')),
    gdpMd: Math.round(sum('GDP_MD')),
    labelRank: row.LABELRANK,
    areaKm2: geography.areaKm2Overrides[id] ?? Math.round(areaById.get(id) / 1e6),
    label: geography.labelOverrides[id] ?? [round(row.LABEL_X), round(row.LABEL_Y)],
    ...hemispheres(feature.geometry),
    neighbors: neighbors[id] ?? [],
    capitals: required(capitals[id], `capital for ${id}`),
    landlocked: geography.landlocked.includes(id),
    island: geography.islandNations.includes(id),
    coasts: Object.keys(geography.coasts).filter((w) => geography.coasts[w].strict.includes(id)),
    coastsLenient: Object.keys(geography.coasts).filter((w) =>
      geography.coasts[w].lenient.includes(id),
    ),
    familiarityAdjust: geography.familiarityAdjust[id] ?? 0,
    aliases: aliasesFor(id, row),
  }
}

const distances = {
  ids: playable.map((f) => f.properties.id),
  km: borderDistanceMatrix(playable, touching),
}
writeFileSync(
  FACTS_PATH,
  JSON.stringify({
    countries: facts,
    distances,
    journeyExclusions: geography.journeyExclusions,
    ambiguousNames: readJson('data/aliases.json').ambiguous,
  }),
)

const micro = playable.filter((f) => f.properties.isMicro).map((f) => f.properties.name)
const sizeKb = (path) => Math.round(readFileSync(path).length / 1024)
console.log(
  `Wrote ${OUTPUT_PATH}: ${features.length} features, ${playable.length} playable, ${sizeKb(OUTPUT_PATH)} KB`,
)
console.log(`Wrote ${FACTS_PATH}: ${sizeKb(FACTS_PATH)} KB`)
console.log(`Micro-states (${micro.length}): ${micro.join(', ')}`)

/** Natural Earth attributes by ADM0_A3, read before any merging. */
async function readAttributes() {
  const result = await mapshaper.applyCommands(`-i ${SHP_PATH} -o attrs.json format=json`)
  return new Map(JSON.parse(result['attrs.json']).map((row) => [row.ADM0_A3, row]))
}

/**
 * Playable countries that share a land border, found from arcs the TopoJSON output shares
 * between shapes, plus curated corrections for borders simplification loses (enclaves).
 */
function sharedBorders(topology, ids) {
  const layer = Object.values(topology.objects)[0]
  const owners = new Map()
  for (const shape of layer.geometries) {
    const arcs = shape.type === 'Polygon' ? shape.arcs.flat() : (shape.arcs ?? []).flat(2)
    for (const arc of arcs) {
      const index = arc < 0 ? ~arc : arc
      if (!owners.has(index)) owners.set(index, new Set())
      owners.get(index).add(shape.properties.ADM0_A3)
    }
  }

  const pairs = new Set()
  const addPair = (a, b) => {
    if (a !== b && ids.has(a) && ids.has(b)) pairs.add([a, b].sort().join('|'))
  }
  for (const shared of owners.values()) {
    for (const a of shared) for (const b of shared) addPair(a, b)
  }
  for (const [a, b] of geography.neighborOverrides.add) addPair(a, b)
  for (const pair of geography.neighborOverrides.remove) pairs.delete([...pair].sort().join('|'))

  const result = {}
  for (const pair of [...pairs].sort()) {
    const [a, b] = pair.split('|')
    ;(result[a] ??= []).push(b)
    ;(result[b] ??= []).push(a)
  }
  for (const list of Object.values(result)) list.sort()
  return result
}

function aliasesFor(id, row) {
  const name = places[id].name
  // Abbreviated ("Dem. Rep. Congo") and inverted ("Korea, South") forms are not typed by players.
  const fromNaturalEarth = ALIAS_FIELDS.map((field) => row[field]).filter(
    (value) => value && !value.includes('.') && !value.includes(','),
  )
  const all = [...fromNaturalEarth, ...(curatedAliases[id] ?? [])]
  return [...new Set(all)].filter((alias) => alias !== name)
}

/**
 * Which hemispheres a country has land in, and whether any of its land lies on the equator.
 * Checked per polygon so overseas islands (France's Réunion) do not put a country on the equator.
 */
function hemispheres(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  const result = { landNorth: false, landSouth: false, onEquator: false }
  for (const polygon of polygons) {
    const [[, minLat], [, maxLat]] = geoBounds({ type: 'Polygon', coordinates: polygon })
    if (maxLat > 0) result.landNorth = true
    if (minLat < 0) result.landSouth = true
    if (minLat < 0 && maxLat > 0) result.onEquator = true
  }
  return result
}

function reverseRings(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  for (const polygon of polygons) for (const ring of polygon) ring.reverse()
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function required(value, what) {
  if (value === undefined) throw new Error(`Missing ${what}`)
  return value
}

function round(value) {
  return Math.round(value * 1e4) / 1e4
}
