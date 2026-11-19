import type { BorderLinesData } from './borders'
import type { LonLat } from './coords'
import { CountryIndex, type CountryCollection, type CountryFeature, type Region } from './countries'
import { fetchJson, type PlacePack } from './facts'
import { NameMatcher } from './names'

export const SUB_KEY_PREFIX = 'sub:'

export const SUB_PACK_IDS = ['USA', 'CAN', 'MEX', 'BRA', 'AUS', 'IND', 'CHN', 'DEU'] as const
export type SubPackId = (typeof SUB_PACK_IDS)[number]

export interface SubPackMeta {
  id: SubPackId
  name: string
  unitLabel: string
  count: number
}

export const SUB_PACKS: readonly SubPackMeta[] = [
  { id: 'USA', name: 'United States', unitLabel: 'states', count: 51 },
  { id: 'CAN', name: 'Canada', unitLabel: 'provinces & territories', count: 13 },
  { id: 'MEX', name: 'Mexico', unitLabel: 'states', count: 32 },
  { id: 'BRA', name: 'Brazil', unitLabel: 'states', count: 27 },
  { id: 'AUS', name: 'Australia', unitLabel: 'states & territories', count: 8 },
  { id: 'IND', name: 'India', unitLabel: 'states & union territories', count: 36 },
  { id: 'CHN', name: 'China', unitLabel: 'provinces & regions', count: 31 },
  { id: 'DEU', name: 'Germany', unitLabel: 'states', count: 16 },
]

export function isSubPackId(value: unknown): value is SubPackId {
  return typeof value === 'string' && (SUB_PACK_IDS as readonly string[]).includes(value)
}

export function subPackMeta(id: SubPackId): SubPackMeta {
  return SUB_PACKS.find((p) => p.id === id)!
}

export function subPlaceKey(packId: SubPackId, unitId: string): string {
  return `${SUB_KEY_PREFIX}${packId.toLowerCase()}:${unitId.toLowerCase()}`
}

export function parseSubPlaceKey(key: string): { packId: SubPackId; unitId: string } | null {
  if (!key.startsWith(SUB_KEY_PREFIX)) return null
  const rest = key.slice(SUB_KEY_PREFIX.length)
  const colon = rest.indexOf(':')
  if (colon === -1) return null
  const packId = rest.slice(0, colon).toUpperCase()
  const unitId = rest.slice(colon + 1).toUpperCase()
  if (!isSubPackId(packId) || !unitId) return null
  return { packId, unitId }
}

export interface SubdivisionUnitFacts {
  subregion: string
  areaKm2: number
  label: LonLat
  labelRank: number
  neighbors: string[]
  aliases: string[]
}

export interface SubdivisionPackFile {
  countryId: SubPackId
  countryName: string
  region: Region
  zeroPointsKm: number
  collection: CountryCollection
  units: Record<string, SubdivisionUnitFacts>
  borders: BorderLinesData
}

/**
 * One country's states or provinces loaded into its own `CountryIndex`, implementing `PlacePack`
 * so the existing locate and identify evaluators, name choices and difficulty weighting run
 * unchanged.
 */
export class SubdivisionPack implements PlacePack {
  readonly countryId: SubPackId
  readonly countryName: string
  readonly region: Region
  readonly zeroPointsKm: number
  readonly countries: CountryIndex
  readonly names: NameMatcher
  readonly playableIds: string[]
  readonly borders: BorderLinesData
  private readonly units: Record<string, SubdivisionUnitFacts>
  private readonly difficultyById: Map<string, number>

  constructor(file: SubdivisionPackFile) {
    this.countryId = file.countryId
    this.countryName = file.countryName
    this.region = file.region
    this.zeroPointsKm = file.zeroPointsKm
    this.countries = new CountryIndex(file.collection)
    this.units = file.units
    this.playableIds = Object.keys(file.units).sort()
    this.borders = file.borders

    const ranked = [...this.playableIds].sort((a, b) => {
      const ua = this.units[a]
      const ub = this.units[b]
      const scoreA = Math.log10(Math.max(10, ua.areaKm2)) - ua.labelRank * 0.35
      const scoreB = Math.log10(Math.max(10, ub.areaKm2)) - ub.labelRank * 0.35
      return scoreB - scoreA || a.localeCompare(b)
    })
    const denom = Math.max(1, ranked.length - 1)
    this.difficultyById = new Map(
      ranked.map((id, index) => [id, Math.round((index / denom) * 1e4) / 1e4]),
    )

    this.names = new NameMatcher(
      this.playableIds.map((id) => ({
        id,
        name: this.nameOf(id),
        aliases: this.units[id].aliases,
      })),
    )
  }

  feature(id: string): CountryFeature {
    const feature = this.countries.get(id)
    if (!feature) throw new Error(`Unknown subdivision: ${id}`)
    return feature
  }

  factsOf(id: string): SubdivisionUnitFacts {
    const facts = this.units[id]
    if (!facts) throw new Error(`No facts for subdivision: ${id}`)
    return facts
  }

  nameOf(id: string): string {
    return this.countries.get(id)?.properties.name ?? id
  }

  difficulty(id: string): number {
    return this.difficultyById.get(id) ?? 1
  }
}

const cached = new Map<SubPackId, Promise<SubdivisionPack>>()
const loaded = new Map<SubPackId, SubdivisionPack>()

export function peekSubdivisionPack(id: SubPackId): SubdivisionPack | null {
  return loaded.get(id) ?? null
}

export function loadSubdivisionPack(id: SubPackId): Promise<SubdivisionPack> {
  const existing = cached.get(id)
  if (existing) return existing
  const promise = fetchJson<SubdivisionPackFile>(`data/sub/${id}.json`)
    .then((file) => {
      const pack = new SubdivisionPack(file)
      loaded.set(id, pack)
      return pack
    })
    .catch((error) => {
      cached.delete(id)
      throw error
    })
  cached.set(id, promise)
  return promise
}
