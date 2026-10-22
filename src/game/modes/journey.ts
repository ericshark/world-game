import type { GeoData } from '../../geo/facts'
import {
  buildTravelGraph,
  canEnter,
  cheapestRoute,
  costsFrom,
  type RouteRules,
  type TravelLink,
} from '../../geo/graph'
import type { ScoringRegion } from '../../geo/scoring'
import type { ModeRules, SessionEvent } from '../core/mode'
import { createRandom, shuffled } from '../core/random'
import { targetPool } from '../core/targets'
import type { CountryOutcome, PlayerId } from '../core/types'
import { EXPEDITIONS } from './expeditions'

export type JourneyConfig =
  { kind: 'quick'; region: ScoringRegion } | { kind: 'expedition'; expeditionId: string }

export const DEFAULT_JOURNEY_CONFIG: JourneyConfig = { kind: 'quick', region: 'World' }
export const JOURNEY_MAX_POINTS = 1000
const POINTS_PER_EXTRA_STEP = 150
const MIN_POINTS = 100
export const MISSTEP_COST = 1
export const HINT_COST = 1
/** Quick journeys are picked to take this many steps at best. */
export const QUICK_PAR_RANGE: [number, number] = [5, 9]

export interface JourneyStep {
  /** The country the player tried to enter. */
  countryId: string
  kind: 'land' | 'sea' | 'misstep'
  /** Why a misstep was not allowed. */
  reason?: 'not-connected' | 'forbidden'
  cost: number
  at: number
}

export interface JourneyState {
  config: JourneyConfig
  seed: string
  player: PlayerId
  startedAt: number
  endedAt: number | null
  from: string
  to: string
  rules: RouteRules
  par: number
  /** Countries visited in order, starting with `from`. */
  route: string[]
  steps: JourneyStep[]
  /** Steps spent, including missteps and hints. */
  cost: number
  hintsUsed: number
  gaveUp: boolean
}

export type JourneyEvent =
  | SessionEvent
  | { type: 'hint'; playerId: PlayerId; at: number }
  | { type: 'giveUp'; playerId: PlayerId; at: number }

export function journeyBestKey(config: JourneyConfig): string {
  return config.kind === 'quick'
    ? `journey:quick:${config.region}`
    : `journey:${config.expeditionId}`
}

/** 3 stars at par, 2 within two steps of it, 1 for any finish. */
export function journeyStars(state: JourneyState): 0 | 1 | 2 | 3 {
  if (!arrived(state)) return 0
  const over = state.cost - state.par
  return over <= 0 ? 3 : over <= 2 ? 2 : 1
}

export function journeyScore(state: JourneyState): number {
  if (!arrived(state)) return 0
  const over = Math.max(0, state.cost - state.par)
  return Math.max(MIN_POINTS, JOURNEY_MAX_POINTS - POINTS_PER_EXTRA_STEP * over)
}

export function arrived(state: JourneyState): boolean {
  return state.route.at(-1) === state.to && visitsDone(state)
}

/** How many of the required waypoints the route has passed. */
export function visitsMade(state: JourneyState): number {
  const ids = state.rules.visit?.ids ?? []
  return ids.filter((id) => state.route.includes(id)).length
}

function visitsDone(state: JourneyState): boolean {
  return visitsMade(state) >= (state.rules.visit?.count ?? 0)
}

// Building the graph takes a moment; every game on the same data shares it.
const graphs = new WeakMap<GeoData, Map<string, TravelLink[]>>()
export function travelGraph(geo: GeoData): Map<string, TravelLink[]> {
  let graph = graphs.get(geo)
  if (!graph) {
    graph = buildTravelGraph(geo)
    graphs.set(geo, graph)
  }
  return graph
}

/** Where you can go next from the current country, under the journey's rules. */
export function connectionsFrom(state: JourneyState, geo: GeoData): TravelLink[] {
  return (travelGraph(geo).get(state.route.at(-1)!) ?? []).filter((link) =>
    canEnter(link.to, state.rules, geo),
  )
}

/**
 * Strategy mode: travel from one country to another by entering neighbours (or crossing short
 * stretches of sea) on a borderless globe. Every move is a location challenge.
 */
export const journey: ModeRules<JourneyConfig, JourneyState, JourneyEvent> = {
  start({ config, seed, now, geo, players }) {
    const graph = travelGraph(geo)
    const { from, to, rules } =
      config.kind === 'expedition'
        ? expeditionOf(config.expeditionId)
        : quickPair(config, seed, geo)
    const par = cheapestRoute(graph, from, to, rules, geo)?.cost
    if (par === undefined) throw new Error(`No route from ${from} to ${to}`)
    return {
      config,
      seed,
      player: players[0],
      startedAt: now,
      endedAt: null,
      from,
      to,
      rules,
      par,
      route: [from],
      steps: [],
      cost: 0,
      hintsUsed: 0,
      gaveUp: false,
    }
  },

  reduce(state, event, geo) {
    if (state.endedAt !== null) return state
    switch (event.type) {
      case 'tick':
      case 'next':
        return state
      case 'hint':
        if (event.playerId !== state.player) return state
        return { ...state, hintsUsed: state.hintsUsed + 1, cost: state.cost + HINT_COST }
      case 'giveUp':
        if (event.playerId !== state.player) return state
        return { ...state, gaveUp: true, endedAt: event.at }
      case 'submit': {
        const { pin, answerId, at } = event.submission
        if (event.playerId !== state.player) return state
        const id = answerId ?? (pin ? geo.countries.countryAt(pin)?.properties.id : undefined)
        const current = state.route.at(-1)!
        // Oceans, unplayable territories and the country you are in are free to tap.
        if (!id || id === current || !geo.playableIds.includes(id)) return state

        const link = travelGraph(geo)
          .get(current)!
          .find((l) => l.to === id)
        const allowed = link && canEnter(id, state.rules, geo)
        const step: JourneyStep = allowed
          ? { countryId: id, kind: link.by, cost: link.cost, at }
          : {
              countryId: id,
              kind: 'misstep',
              reason: link ? 'forbidden' : 'not-connected',
              cost: MISSTEP_COST,
              at,
            }
        const next: JourneyState = {
          ...state,
          steps: [...state.steps, step],
          cost: state.cost + step.cost,
          route: allowed ? [...state.route, id] : state.route,
        }
        return arrived(next) ? { ...next, endedAt: at } : next
      }
    }
  },

  isFinished: (state) => state.endedAt !== null,

  deadline: () => null,

  outcomesBetween(previous, next) {
    return next.steps.slice(previous.steps.length).map(outcomeOf)
  },

  summarize(state) {
    return {
      mode: 'journey',
      bestKey: journeyBestKey(state.config),
      seed: state.seed,
      startedAt: state.startedAt,
      endedAt: state.endedAt ?? state.startedAt,
      score: journeyScore(state),
      maxScore: JOURNEY_MAX_POINTS,
      outcomes: state.steps.map(outcomeOf),
    }
  },
}

function expeditionOf(id: string) {
  const expedition = EXPEDITIONS.find((e) => e.id === id)
  if (!expedition) throw new Error(`Unknown expedition: ${id}`)
  return expedition
}

/** A random start and destination in the region whose best route is a satisfying length. */
function quickPair(config: { region: ScoringRegion }, seed: string, geo: GeoData) {
  const random = createRandom(seed)
  const graph = travelGraph(geo)
  const pool = targetPool(geo.countries.features, { region: config.region, skipMicro: true }).map(
    (f) => f.properties.id,
  )
  const [min, max] = QUICK_PAR_RANGE
  let fallback: { from: string; to: string; par: number } | null = null
  for (const from of shuffled(pool, random)) {
    const costs = costsFrom(graph, from)
    const reachable = pool.filter((id) => id !== from && costs.has(id))
    const fits = reachable.filter((id) => costs.get(id)! >= min && costs.get(id)! <= max)
    if (fits.length > 0) return { from, to: shuffled(fits, random)[0], rules: {} }
    // Small regions may have no pair that long; keep the longest one found.
    for (const to of reachable) {
      if (!fallback || costs.get(to)! > fallback.par) fallback = { from, to, par: costs.get(to)! }
    }
  }
  if (!fallback) throw new Error(`No journey possible in ${config.region}`)
  return { from: fallback.from, to: fallback.to, rules: {} }
}

function outcomeOf(step: JourneyStep): CountryOutcome {
  return { countryId: step.countryId, skill: 'visit', success: step.kind !== 'misstep' }
}
