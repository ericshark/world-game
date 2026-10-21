// Builds public/data/countries.json from Natural Earth 1:10m admin-0 countries (public domain).
// Run with `npm run build:data`. Raw downloads are cached in .cache/.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { geoArea } from 'd3-geo'
import mapshaper from 'mapshaper'

const SOURCE_URL = 'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip'
const CACHE_DIR = '.cache'
const ZIP_PATH = `${CACHE_DIR}/ne_10m_admin_0_countries.zip`
const SHP_PATH = `${CACHE_DIR}/ne10/ne_10m_admin_0_countries.shp`
const OUTPUT_PATH = 'public/data/countries.json'

const EARTH_RADIUS_KM = 6371
// Countries smaller than this are hard to click at max zoom and get a hit radius in-game.
const MICRO_AREA_KM2 = 2500

// Breakaway or leased areas merged into the country they are usually shown as part of,
// so the reveal highlight has no holes.
const MERGE_INTO_PARENT = { SOL: 'SOM', CYN: 'CYP', KAB: 'KAZ', USG: 'CUB' }

if (!existsSync(SHP_PATH)) {
  mkdirSync(CACHE_DIR, { recursive: true })
  console.log(`Downloading ${SOURCE_URL}`)
  execFileSync('curl', ['-sSLf', '-o', ZIP_PATH, SOURCE_URL], { stdio: 'inherit' })
  execFileSync('unzip', ['-o', '-q', ZIP_PATH, '-d', `${CACHE_DIR}/ne10`], { stdio: 'inherit' })
}

const places = JSON.parse(readFileSync('data/places.json', 'utf8'))

const mergeExpression = `ADM0_A3 = (${JSON.stringify(MERGE_INTO_PARENT)})[ADM0_A3] || ADM0_A3`
const output = await mapshaper.applyCommands(
  [
    `-i ${SHP_PATH}`,
    `-each '${mergeExpression}'`,
    '-dissolve ADM0_A3 copy-fields=NAME_LONG,CONTINENT',
    '-simplify 12% weighted keep-shapes',
    '-o countries.json format=geojson precision=0.0001',
  ].join(' '),
)
const collection = JSON.parse(output['countries.json'])

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

const playable = features.filter((f) => f.properties.playable)
const micro = playable.filter((f) => f.properties.isMicro).map((f) => f.properties.name)
const sizeKb = Math.round(readFileSync(OUTPUT_PATH).length / 1024)
console.log(
  `Wrote ${OUTPUT_PATH}: ${features.length} features, ${playable.length} playable, ${sizeKb} KB`,
)
console.log(`Micro-states (${micro.length}): ${micro.join(', ')}`)

function reverseRings(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  for (const polygon of polygons) for (const ring of polygon) ring.reverse()
}
