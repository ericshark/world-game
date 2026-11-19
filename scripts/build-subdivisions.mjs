// Builds public/data/sub/<ID>.json (one lazy pack per country) from Natural Earth 1:10m
// admin-1 states and provinces (public domain). Run with `npm run build:sub`.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { geoArea, geoContains } from 'd3-geo'
import mapshaper from 'mapshaper'

const SOURCE_URL =
  'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_1_states_provinces.zip'
const CACHE_DIR = '.cache'
const ZIP_PATH = `${CACHE_DIR}/ne_10m_admin_1_states_provinces.zip`
const SHP_PATH = `${CACHE_DIR}/ne-admin1/ne_10m_admin_1_states_provinces.shp`
const OUTPUT_DIR = 'public/data/sub'

const MICRO_AREA_KM2 = 2500

const PACKS = [
  { id: 'USA', name: 'United States' },
  { id: 'CAN', name: 'Canada' },
  { id: 'MEX', name: 'Mexico' },
  { id: 'BRA', name: 'Brazil' },
  { id: 'AUS', name: 'Australia' },
  { id: 'IND', name: 'India' },
  { id: 'CHN', name: 'China' },
  { id: 'DEU', name: 'Germany' },
]

const NAME_OVERRIDES = {
  'US-DC': 'District of Columbia',
  'MX-DIF': 'Mexico City',
  'MX-MEX': 'State of Mexico',
  'BR-DF': 'Distrito Federal',
  'DE-HB': 'Bremen',
}

const ALIAS_OVERRIDES = {
  'US-DC': ['Washington DC', 'DC'],
  'MX-DIF': ['CDMX', 'Ciudad de Mexico', 'Distrito Federal'],
  'MX-MEX': ['Estado de Mexico', 'Edomex', 'Mexico'],
  'BR-DF': ['Federal District', 'Brasilia'],
  'DE-HB': ['Free Hanseatic Bremen'],
  'CN-XZ': ['Xizang'],
  'CN-NM': ['Nei Mongol'],
}

if (!existsSync(SHP_PATH)) {
  mkdirSync(CACHE_DIR, { recursive: true })
  console.log(`Downloading ${SOURCE_URL}`)
  execFileSync('curl', ['-sSLf', '-o', ZIP_PATH, SOURCE_URL], { stdio: 'inherit' })
  execFileSync('unzip', ['-o', '-q', ZIP_PATH, '-d', `${CACHE_DIR}/ne-admin1`], {
    stdio: 'inherit',
  })
}

const places = JSON.parse(readFileSync('data/places.json', 'utf8'))
mkdirSync(OUTPUT_DIR, { recursive: true })

for (const pack of PACKS) {
  const region = places[pack.id]?.region ?? 'World'
  const output = await mapshaper.applyCommands(
    [
      `-i ${SHP_PATH}`,
      `-filter "adm0_a3 == '${pack.id}' && !iso_3166_2.includes('~')"`,
      '-dissolve iso_3166_2 copy-fields=name,name_en,name_alt,type_en,postal,region,region_sub,latitude,longitude,labelrank,scalerank',
      "-each 'AREA_M2=this.area'",
      `-simplify variable percentage='AREA_M2 < ${MICRO_AREA_KM2 * 1e6} ? 1 : 0.15' weighted keep-shapes`,
      "-each 'LX=this.innerX, LY=this.innerY'",
      '-o pack.json format=geojson precision=0.0001',
      '-o pack.topojson format=topojson',
      '-innerlines + name=borders',
      '-o target=borders borders.json format=geojson precision=0.0001',
    ].join(' '),
  )

  const collection = JSON.parse(output['pack.json'])
  const areaById = new Map(
    collection.features.map((f) => [f.properties.iso_3166_2, f.properties.AREA_M2]),
  )

  const features = collection.features
    .map((feature) => {
      const p = feature.properties
      const id = p.iso_3166_2
      if (geoArea(feature) > 2 * Math.PI) reverseRings(feature.geometry)
      const areaKm2 = Math.max(1, Math.round((areaById.get(id) ?? 0) / 1e6))
      const name = NAME_OVERRIDES[id] ?? cleanSpaces(p.name_en || p.name)
      return {
        raw: p,
        areaKm2,
        feature: {
          type: 'Feature',
          properties: {
            id,
            name,
            playable: true,
            status: null,
            region,
            isMicro: areaKm2 < MICRO_AREA_KM2,
          },
          geometry: feature.geometry,
        },
      }
    })
    .sort((a, b) => a.feature.properties.id.localeCompare(b.feature.properties.id))

  const allIds = new Set(features.map((f) => f.feature.properties.id))
  const neighbors = sharedBorders(JSON.parse(output['pack.topojson']), allIds)
  const units = {}

  for (const { raw, areaKm2, feature } of features) {
    const { id, name } = feature.properties
    const primaryLabel = [round(raw.longitude), round(raw.latitude)]
    const fallbackLabel = [round(raw.LX ?? raw.longitude), round(raw.LY ?? raw.latitude)]
    const label = geoContains(feature, primaryLabel) ? primaryLabel : fallbackLabel
    const subregion = cleanSpaces(raw.region_sub || raw.region || pack.name)

    units[id] = {
      subregion,
      areaKm2,
      label,
      labelRank: Number.isFinite(Number(raw.labelrank)) ? Number(raw.labelrank) : 5,
      neighbors: neighbors[id] ?? [],
      aliases: aliasesFor(id, name, raw),
    }
  }

  const totalAreaKm2 = Object.values(units).reduce((sum, u) => sum + u.areaKm2, 0)
  // Scale zero-points cutoff with country span (~1,150 km for USA/Canada/China, ~380 km for Germany).
  const zeroPointsKm = Math.round(Math.min(1200, Math.max(350, Math.sqrt(totalAreaKm2) * 0.38)))

  const bordersGeo = JSON.parse(output['borders.json'])
  const borders = (bordersGeo.geometries ?? []).flatMap((g) =>
    g.type === 'LineString' ? [g.coordinates] : g.coordinates,
  )

  const filePath = `${OUTPUT_DIR}/${pack.id}.json`
  writeFileSync(
    filePath,
    JSON.stringify({
      countryId: pack.id,
      countryName: pack.name,
      region,
      zeroPointsKm,
      collection: {
        type: 'FeatureCollection',
        features: features.map((f) => f.feature),
      },
      units,
      borders,
    }),
  )

  const sizeKb = Math.round(readFileSync(filePath).length / 1024)
  console.log(
    `Wrote ${filePath}: ${features.length} units, cutoff ${zeroPointsKm} km (${sizeKb} KB)`,
  )
}

function sharedBorders(topology, ids) {
  const layer = Object.values(topology.objects)[0]
  const owners = new Map()
  for (const shape of layer.geometries) {
    const arcs = shape.type === 'Polygon' ? shape.arcs.flat() : (shape.arcs ?? []).flat(2)
    for (const arc of arcs) {
      const index = arc < 0 ? ~arc : arc
      if (!owners.has(index)) owners.set(index, new Set())
      owners.get(index).add(shape.properties.iso_3166_2)
    }
  }

  const pairs = new Set()
  const addPair = (a, b) => {
    if (a !== b && ids.has(a) && ids.has(b)) pairs.add([a, b].sort().join('|'))
  }
  for (const shared of owners.values()) {
    for (const a of shared) for (const b of shared) addPair(a, b)
  }

  const result = {}
  for (const pair of [...pairs].sort()) {
    const [a, b] = pair.split('|')
    ;(result[a] ??= []).push(b)
    ;(result[b] ??= []).push(a)
  }
  for (const list of Object.values(result)) list.sort()
  return result
}

function aliasesFor(id, name, raw) {
  const alts = String(raw.name_alt || '')
    .split('|')
    .map((s) => cleanSpaces(s))
    .filter((s) => s && !s.includes('.') && !s.includes('(') && s.length >= 2)
  const local = cleanSpaces(raw.name || '')
  const postal = cleanSpaces(raw.postal || '')
  const all = [
    ...(local && local !== name ? [local] : []),
    ...alts,
    ...(postal.length >= 2 ? [postal] : []),
    ...(ALIAS_OVERRIDES[id] ?? []),
  ]
  return [...new Set(all)].filter((alias) => alias.toLowerCase() !== name.toLowerCase())
}

function reverseRings(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  for (const polygon of polygons) for (const ring of polygon) ring.reverse()
}

function cleanSpaces(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function round(value) {
  return Math.round(Number(value) * 1e4) / 1e4
}
