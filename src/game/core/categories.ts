import type { GeoData } from '../../geo/facts'

/**
 * A Rare Earth prompt such as "Name a landlocked country in Africa". Plain data, so it can be
 * stored in game state and sent over the network.
 */
export interface Category {
  id: string
  kind: CategoryKind
  prompt: string
  /** Countries that clearly fit. */
  valid: string[]
  /** Countries that fit by some reasonable reading (near a threshold, a marginal sea). */
  lenient: string[]
}

export type CategoryKind =
  | 'subregion'
  | 'landlocked'
  | 'island'
  | 'borders'
  | 'coast'
  | 'population-under'
  | 'population-over'
  | 'area-under'
  | 'area-over'
  | 'equator'
  | 'southern'
  | 'name-ends'
  | 'name-starts'

/** Too few answers leaves no room for rarity; too many makes it a giveaway. */
export const MIN_ANSWERS = 4
export const MAX_ANSWERS = 40
/** Numbers within this share of a threshold count either way: the data is approximate. */
const THRESHOLD_TOLERANCE = 0.1

const SUBREGION_LABELS: Record<string, string> = {
  Caribbean: 'the Caribbean',
  'Middle Africa': 'Central Africa',
  'Western Asia': 'Western Asia (the Middle East and the Caucasus)',
  'South-Eastern Asia': 'Southeast Asia',
  'Central America': 'Central America (including Mexico)',
}

const POPULATION_UNDER = [100_000, 500_000, 1_000_000, 2_000_000]
const POPULATION_OVER = [50_000_000, 100_000_000, 200_000_000]
const AREA_UNDER = [1_000, 10_000, 30_000]
const AREA_OVER = [1_000_000, 2_000_000]
const NAME_ENDINGS = ['stan', 'land']

/** Every usable category for the playable countries. */
export function buildCategories(geo: GeoData): Category[] {
  const ids = geo.playableIds
  const facts = (id: string) => geo.factsOf(id)
  const region = (id: string) => geo.feature(id).properties.region
  const name = (id: string) => geo.nameOf(id)
  const regions = [...new Set(ids.map(region))].sort()
  const categories: Category[] = []
  const add = (category: Omit<Category, 'lenient'> & { lenient?: string[] }) => {
    const lenient = (category.lenient ?? []).filter((id) => !category.valid.includes(id))
    if (category.valid.length >= MIN_ANSWERS && category.valid.length <= MAX_ANSWERS) {
      categories.push({ ...category, valid: [...category.valid].sort(), lenient: lenient.sort() })
    }
  }

  for (const subregion of [...new Set(ids.map((id) => facts(id).subregion))].sort()) {
    add({
      id: `subregion:${subregion}`,
      kind: 'subregion',
      prompt: `Name a country in ${SUBREGION_LABELS[subregion] ?? subregion}`,
      valid: ids.filter((id) => facts(id).subregion === subregion),
    })
  }

  for (const r of regions) {
    const inRegion = ids.filter((id) => region(id) === r)
    add({
      id: `landlocked:${r}`,
      kind: 'landlocked',
      prompt: `Name a landlocked country in ${r}`,
      valid: inRegion.filter((id) => facts(id).landlocked),
    })
    add({
      id: `island:${r}`,
      kind: 'island',
      prompt: `Name an island nation in ${r === 'North America' ? 'North America and the Caribbean' : r}`,
      valid: inRegion.filter((id) => facts(id).island),
    })
  }

  for (const id of ids) {
    if (facts(id).neighbors.length < MIN_ANSWERS) continue
    add({
      id: `borders:${id}`,
      kind: 'borders',
      prompt: `Name a country that borders ${name(id)}`,
      valid: facts(id).neighbors,
    })
  }

  const waters = [...new Set(ids.flatMap((id) => facts(id).coasts))].sort()
  for (const water of waters) {
    const strict = ids.filter((id) => facts(id).coasts.includes(water))
    const lenient = ids.filter((id) => facts(id).coastsLenient.includes(water))
    if (strict.length <= MAX_ANSWERS) {
      add({
        id: `coast:${water}`,
        kind: 'coast',
        prompt: `Name a country with a coast on the ${water}`,
        valid: strict,
        lenient,
      })
      continue
    }
    // Oceans have too many shores; split them by region.
    for (const r of regions) {
      add({
        id: `coast:${water}:${r}`,
        kind: 'coast',
        prompt: `Name a country in ${r} with a coast on the ${water}`,
        valid: strict.filter((id) => region(id) === r),
        lenient: lenient.filter((id) => region(id) === r),
      })
    }
  }

  for (const limit of POPULATION_UNDER) {
    add({
      id: `population-under:${limit}`,
      kind: 'population-under',
      prompt: `Name a country with fewer than ${formatCount(limit)} people`,
      ...threshold(ids, (id) => facts(id).population, limit, 'under'),
    })
  }
  for (const limit of POPULATION_OVER) {
    add({
      id: `population-over:${limit}`,
      kind: 'population-over',
      prompt: `Name a country with more than ${formatCount(limit)} people`,
      ...threshold(ids, (id) => facts(id).population, limit, 'over'),
    })
  }
  for (const limit of AREA_UNDER) {
    add({
      id: `area-under:${limit}`,
      kind: 'area-under',
      prompt: `Name a country smaller than ${formatCount(limit)} km²`,
      ...threshold(ids, (id) => facts(id).areaKm2, limit, 'under'),
    })
  }
  for (const limit of AREA_OVER) {
    add({
      id: `area-over:${limit}`,
      kind: 'area-over',
      prompt: `Name a country larger than ${formatCount(limit)} km²`,
      ...threshold(ids, (id) => facts(id).areaKm2, limit, 'over'),
    })
  }

  add({
    id: 'equator',
    kind: 'equator',
    prompt: 'Name a country the equator passes through',
    valid: ids.filter((id) => facts(id).onEquator),
    // The equator crosses their waters or islets too small for the map.
    lenient: ['STP', 'KIR', 'MDV'],
  })
  add({
    id: 'southern',
    kind: 'southern',
    prompt: 'Name a country entirely in the Southern Hemisphere',
    valid: ids.filter((id) => facts(id).landSouth && !facts(id).landNorth),
  })

  for (const ending of NAME_ENDINGS) {
    add({
      id: `name-ends:${ending}`,
      kind: 'name-ends',
      prompt: `Name a country whose name ends in “-${ending}”`,
      valid: ids.filter((id) => plainName(name(id)).endsWith(ending)),
    })
  }
  for (const letter of 'ABCDEFGHIKLMNPSTUZ') {
    add({
      id: `name-starts:${letter}`,
      kind: 'name-starts',
      prompt: `Name a country starting with “${letter}”`,
      valid: ids.filter((id) => plainName(name(id)).startsWith(letter.toLowerCase())),
    })
  }

  return categories
}

/** Whether an answer counts for the category. */
export function fitsCategory(category: Category, id: string): boolean {
  return category.valid.includes(id) || category.lenient.includes(id)
}

/** Why an answer fits or not, in a short sentence about the country. */
export function explainAnswer(category: Category, id: string, geo: GeoData): string {
  const facts = geo.factsOf(id)
  const name = geo.nameOf(id)
  const [, param, regionParam] = category.id.split(':')
  const region = geo.feature(id).properties.region
  const wrongRegion = (expected: string | undefined) =>
    expected && region !== expected ? `${name} is in ${region}, not ${expected}` : null

  switch (category.kind) {
    case 'subregion':
      return `${name} is in ${SUBREGION_LABELS[facts.subregion] ?? facts.subregion}`
    case 'landlocked':
      return wrongRegion(param) ?? `${name} ${facts.landlocked ? 'is landlocked' : 'has a coast'}`
    case 'island':
      return (
        wrongRegion(param) ??
        `${name} ${facts.island ? 'is an island nation' : 'is not an island nation'}`
      )
    case 'borders': {
      const other = geo.nameOf(param)
      return id === param
        ? `That's ${other} itself`
        : `${name} ${facts.neighbors.includes(param) ? 'borders' : 'does not border'} ${other}`
    }
    case 'coast': {
      const coasts = [...facts.coasts, ...facts.coastsLenient]
      return (
        wrongRegion(regionParam) ??
        (coasts.includes(param)
          ? `${name} has a ${param} coast`
          : coasts.length > 0
            ? `${name}'s coasts: ${facts.coasts.join(', ') || coasts.join(', ')}`
            : `${name} is landlocked`)
      )
    }
    case 'population-under':
    case 'population-over':
      return `${name} has about ${formatCount(facts.population)} people`
    case 'area-under':
    case 'area-over':
      return `${name} covers about ${formatCount(facts.areaKm2)} km²`
    case 'equator':
      return facts.onEquator || category.lenient.includes(id)
        ? `The equator crosses ${name}`
        : `${name} is entirely in the ${facts.landNorth ? 'Northern' : 'Southern'} Hemisphere`
    case 'southern':
      return facts.landNorth
        ? `${name} has land in the Northern Hemisphere`
        : `${name} is entirely south of the equator`
    case 'name-ends':
    case 'name-starts':
      return `It's spelled ${name}`
  }
}

export type RarityTier = 'Common' | 'Uncommon' | 'Rare' | 'Exotic' | 'Legendary'

/**
 * How unusual each accepted answer is: the share of "likely answer" weight belonging to more
 * familiar answers. The most obvious answer scores 0, the most obscure close to 1. Familiarity
 * is an estimate (see docs/data.md), so the game only shows tiers, never fake percentages.
 */
export function rarities(category: Category, geo: GeoData): Map<string, number> {
  const answers = [...category.valid, ...category.lenient]
  const weights = answers.map((id) => ({ id, weight: (0.05 + geo.familiarity(id)) ** 2 }))
  const total = weights.reduce((sum, w) => sum + w.weight, 0)
  return new Map(
    weights.map(({ id, weight }) => [
      id,
      weights.filter((other) => other.weight > weight).reduce((sum, w) => sum + w.weight, 0) /
        total,
    ]),
  )
}

export function rarityTier(rarity: number): RarityTier {
  if (rarity >= 0.93) return 'Legendary'
  if (rarity >= 0.78) return 'Exotic'
  if (rarity >= 0.55) return 'Rare'
  if (rarity >= 0.3) return 'Uncommon'
  return 'Common'
}

function threshold(
  ids: string[],
  value: (id: string) => number,
  limit: number,
  direction: 'under' | 'over',
): { valid: string[]; lenient: string[] } {
  const fits = (v: number) => (direction === 'under' ? v < limit : v > limit)
  const near = (v: number) => Math.abs(v - limit) <= limit * THRESHOLD_TOLERANCE
  return {
    valid: ids.filter((id) => fits(value(id))),
    lenient: ids.filter((id) => !fits(value(id)) && near(value(id))),
  }
}

function formatCount(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)} billion`
  if (value >= 1e6) return `${Number((value / 1e6).toFixed(1))} million`
  return new Intl.NumberFormat('en-US').format(Math.round(value))
}

function plainName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}
