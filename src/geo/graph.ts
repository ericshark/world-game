import type { GeoData } from './facts'

/** Coasts closer than this can be crossed by sea, at a higher cost. */
export const SEA_HOP_KM = 500
export const LAND_COST = 1
export const SEA_COST = 2

export interface TravelLink {
  to: string
  cost: number
  by: 'land' | 'sea'
}

/** Rules a route must follow. */
export interface RouteRules {
  /** Countries that may not be entered. */
  avoid?: string[]
  /** Only countries with a coast may be entered (start and finish included). */
  coastalOnly?: boolean
  /** The route must pass through at least `count` of these countries. */
  visit?: { ids: string[]; count: number }
}

export interface Route {
  cost: number
  path: string[]
}

/**
 * Who you can travel to from each playable country: by land across a shared border, or by sea
 * to a country whose coast is close. Borders through overseas departments (France–Brazil) are
 * left out, or a journey could jump the Atlantic.
 */
export function buildTravelGraph(geo: GeoData): Map<string, TravelLink[]> {
  const excluded = new Set(geo.journeyExclusions.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]))
  const graph = new Map<string, TravelLink[]>()
  for (const from of geo.playableIds) {
    const neighbors = new Set(geo.factsOf(from).neighbors)
    const links: TravelLink[] = []
    for (const to of geo.playableIds) {
      if (to === from || excluded.has(`${from}|${to}`)) continue
      if (neighbors.has(to)) links.push({ to, cost: LAND_COST, by: 'land' })
      else if (geo.borderDistanceKm(from, to) <= SEA_HOP_KM)
        links.push({ to, cost: SEA_COST, by: 'sea' })
    }
    graph.set(from, links)
  }
  return graph
}

export function canEnter(id: string, rules: RouteRules, geo: GeoData): boolean {
  if (rules.avoid?.includes(id)) return false
  if (rules.coastalOnly && geo.factsOf(id).landlocked) return false
  return true
}

/**
 * Cheapest route that follows the rules (Dijkstra over country plus which "visit" countries have
 * been passed, so waypoint rules are exact). Null when there is no way through.
 */
export function cheapestRoute(
  graph: Map<string, TravelLink[]>,
  from: string,
  to: string,
  rules: RouteRules,
  geo: GeoData,
): Route | null {
  const visitIds = rules.visit?.ids ?? []
  const needed = rules.visit?.count ?? 0
  const bitOf = (id: string) => {
    const index = visitIds.indexOf(id)
    return index === -1 ? 0 : 1 << index
  }
  const count = (mask: number) => mask.toString(2).replace(/0/g, '').length
  const key = (id: string, mask: number) => `${id}#${mask}`

  const startMask = bitOf(from)
  const best = new Map<string, number>([[key(from, startMask), 0]])
  const previous = new Map<string, string>()
  // Small graph (≈200 countries × a few masks): a sorted array is plenty fast.
  const queue: { id: string; mask: number; cost: number }[] = [
    { id: from, mask: startMask, cost: 0 },
  ]

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost)
    const { id, mask, cost } = queue.shift()!
    if (cost > (best.get(key(id, mask)) ?? Infinity)) continue
    if (id === to && count(mask) >= needed) {
      const path = [id]
      let at = key(id, mask)
      while (previous.has(at)) {
        at = previous.get(at)!
        path.unshift(at.split('#')[0])
      }
      return { cost, path }
    }
    for (const link of graph.get(id) ?? []) {
      if (!canEnter(link.to, rules, geo)) continue
      const nextMask = mask | bitOf(link.to)
      const nextCost = cost + link.cost
      const nextKey = key(link.to, nextMask)
      if (nextCost < (best.get(nextKey) ?? Infinity)) {
        best.set(nextKey, nextCost)
        previous.set(nextKey, key(id, mask))
        queue.push({ id: link.to, mask: nextMask, cost: nextCost })
      }
    }
  }
  return null
}

/** Cheapest unconstrained cost from one country to every reachable one. */
export function costsFrom(graph: Map<string, TravelLink[]>, from: string): Map<string, number> {
  const costs = new Map<string, number>([[from, 0]])
  const queue = [from]
  while (queue.length > 0) {
    queue.sort((a, b) => costs.get(a)! - costs.get(b)!)
    const id = queue.shift()!
    for (const link of graph.get(id) ?? []) {
      const cost = costs.get(id)! + link.cost
      if (cost < (costs.get(link.to) ?? Infinity)) {
        costs.set(link.to, cost)
        queue.push(link.to)
      }
    }
  }
  return costs
}
