/** Lower-case, accent-free, punctuation-free form used to compare typed names. */
export function normalizeName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^the /, '')
    .replace(/\bst\b/g, 'saint')
}

export type NameMatch =
  { kind: 'match'; id: string } | { kind: 'ambiguous'; ids: string[] } | { kind: 'none' }

export interface NamedPlace {
  id: string
  name: string
  aliases: string[]
}

interface Entry {
  id: string
  normalized: string
  primary: boolean
}

/**
 * Turns what a player typed into a country: exact names and aliases first, then small typos
 * when they point at a single country. Names that fit several countries ("Congo") are
 * reported as ambiguous so the player can choose.
 */
export class NameMatcher {
  private readonly exact = new Map<string, string>()
  private readonly ambiguous = new Map<string, string[]>()
  private readonly entries: Entry[] = []

  constructor(places: NamedPlace[], ambiguousNames: Record<string, string[]> = {}) {
    const primaryNames = new Map(places.map((p) => [normalizeName(p.name), p.id]))
    const aliasOwners = new Map<string, Set<string>>()

    for (const place of places) {
      const seen = new Set<string>()
      const texts = [
        { text: place.name, primary: true },
        ...place.aliases.map((text) => ({ text, primary: false })),
      ]
      for (const { text, primary } of texts) {
        const normalized = normalizeName(text)
        if (!normalized || seen.has(normalized)) continue
        seen.add(normalized)
        this.entries.push({ id: place.id, normalized, primary })
        if (!primary) {
          if (!aliasOwners.has(normalized)) aliasOwners.set(normalized, new Set())
          aliasOwners.get(normalized)!.add(place.id)
        }
      }
    }

    // A country's own name beats another country's alias; aliases shared by several
    // countries are ambiguous.
    for (const [normalized, owners] of aliasOwners) {
      if (primaryNames.has(normalized)) continue
      if (owners.size === 1) this.exact.set(normalized, [...owners][0])
      else this.ambiguous.set(normalized, [...owners].sort())
    }
    for (const [normalized, id] of primaryNames) this.exact.set(normalized, id)
    for (const [name, ids] of Object.entries(ambiguousNames)) {
      const normalized = normalizeName(name)
      this.exact.delete(normalized)
      this.ambiguous.set(normalized, ids)
    }
  }

  match(input: string): NameMatch {
    const normalized = normalizeName(input)
    if (!normalized) return { kind: 'none' }

    const ambiguous = this.ambiguous.get(normalized)
    if (ambiguous) return { kind: 'ambiguous', ids: ambiguous }
    const exact = this.exact.get(normalized)
    if (exact) return { kind: 'match', id: exact }

    const allowed = allowedTypos(normalized.length)
    if (allowed === 0) return { kind: 'none' }
    let best = allowed
    let ids: string[] = []
    for (const entry of this.entries) {
      const distance = editDistance(normalized, entry.normalized, best + 1)
      if (distance > best) continue
      if (distance < best) {
        best = distance
        ids = []
      }
      if (!ids.includes(entry.id)) ids.push(entry.id)
    }
    if (ids.length === 0) return { kind: 'none' }
    if (ids.length === 1) return { kind: 'match', id: ids[0] }
    return { kind: 'ambiguous', ids: ids.sort() }
  }

  /**
   * Countries whose name or alias starts with the input, or has a word that does. Offered
   * from all places alike, so suggestions never hint at which answers are correct.
   */
  suggest(input: string, limit = 6): string[] {
    const normalized = normalizeName(input)
    if (!normalized) return []
    const ranked = this.entries
      .map((entry) => ({ entry, rank: suggestionRank(entry, normalized) }))
      .filter(({ rank }) => rank !== null)
      .sort((a, b) => a.rank! - b.rank! || a.entry.normalized.localeCompare(b.entry.normalized))

    const ids: string[] = []
    for (const { entry } of ranked) {
      if (!ids.includes(entry.id)) ids.push(entry.id)
      if (ids.length === limit) break
    }
    return ids
  }
}

function suggestionRank(entry: Entry, input: string): number | null {
  const base = entry.primary ? 0 : 2
  if (entry.normalized.startsWith(input)) return base
  if (entry.normalized.split(' ').some((word) => word.startsWith(input))) return base + 1
  return null
}

/** Short names must be exact: "Mali" is one letter from "Bali" and "Malta". */
function allowedTypos(length: number): number {
  if (length < 5) return 0
  return length < 9 ? 1 : 2
}

/**
 * Optimal string alignment distance (Levenshtein plus adjacent swaps). Stops early and returns
 * `limit` once the distance is known to reach it.
 */
export function editDistance(a: string, b: string, limit = Infinity): number {
  if (Math.abs(a.length - b.length) >= limit) return limit
  let previousPrevious: number[] = []
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, previousPrevious[j - 2] + 1)
      }
      current.push(value)
      rowMin = Math.min(rowMin, value)
    }
    if (rowMin >= limit) return limit
    previousPrevious = previous
    previous = current
  }
  return Math.min(previous[b.length], limit)
}
