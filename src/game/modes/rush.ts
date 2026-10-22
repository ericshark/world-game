import { nearestPointOnCountry } from '../../geo/distance'
import type { GeoData } from '../../geo/facts'
import type { LonLat } from '../../geo/coords'
import { scoreGuess, ZERO_POINTS_DISTANCE_KM, type ScoringRegion } from '../../geo/scoring'
import type { ModeRules, SessionEvent } from '../core/mode'
import { createRandom, shuffled } from '../core/random'
import { targetPool } from '../core/targets'
import type { CountryOutcome, PlayerId } from '../core/types'

export const RUSH_START_MS = 60_000
/** The clock never banks more than this, so a hot streak cannot run forever. */
export const RUSH_MAX_BANK_MS = 90_000
export const RUSH_HIT_BONUS_MS = 2_000
export const RUSH_MISS_PENALTY_MS = 3_000
export const RUSH_SKIP_PENALTY_MS = 2_000
export const RUSH_HIT_POINTS = 100
export const RUSH_NEAR_POINTS = 40
/** Targets get harder after this many hits. */
export const RUSH_HITS_PER_LEVEL = 5
const BANDS = 4
/** A miss this close (as a share of the region's zero-points distance) still counts as near. */
const NEAR_SHARE = 0.125

export interface RushConfig {
  region: ScoringRegion
  /** No clock: the first miss or skip ends the run. */
  suddenDeath: boolean
}

export const DEFAULT_RUSH_CONFIG: RushConfig = { region: 'World', suddenDeath: false }

export type RushOutcome = 'hit' | 'near' | 'miss' | 'skip'

export interface RushAnswer {
  targetId: string
  outcome: RushOutcome
  points: number
  multiplier: number
  /** Clock change, in ms. */
  timeDeltaMs: number
  guess: LonLat | null
  nearest: LonLat | null
  clickedId: string | null
  distanceKm: number | null
  at: number
}

export interface RushState {
  config: RushConfig
  seed: string
  player: PlayerId
  startedAt: number
  endedAt: number | null
  /** When the clock runs out; null in sudden death. */
  clockEndsAt: number | null
  /** Unused targets from easiest to hardest band, each band shuffled. */
  bands: string[][]
  current: string | null
  answers: RushAnswer[]
  score: number
  streak: number
  bestStreak: number
}

export type RushEvent = SessionEvent | { type: 'skip'; playerId: PlayerId; at: number }

/** The multiplier earned by a run of consecutive hits. */
export function rushMultiplier(streak: number): number {
  if (streak >= 15) return 5
  if (streak >= 10) return 4
  if (streak >= 6) return 3
  if (streak >= 3) return 2
  return 1
}

export function rushBestKey(config: RushConfig): string {
  return ['rush', config.region, config.suddenDeath && 'sudden-death'].filter(Boolean).join(':')
}

/**
 * Speed mode: find as many countries as you can before the clock runs out. One tap answers;
 * hits buy time and build a multiplier, misses cost time, and countries get harder as you go.
 */
export const rush: ModeRules<RushConfig, RushState, RushEvent> = {
  start({ config, seed, now, geo, players }) {
    const random = createRandom(seed)
    const pool = targetPool(geo.countries.features, { region: config.region, skipMicro: false })
      .map((f) => f.properties.id)
      .sort((a, b) => geo.difficulty(a) - geo.difficulty(b) || a.localeCompare(b))
    const size = Math.ceil(pool.length / BANDS)
    const bands = Array.from({ length: BANDS }, (_, band) =>
      shuffled(pool.slice(band * size, (band + 1) * size), random),
    )
    const state: RushState = {
      config,
      seed,
      player: players[0],
      startedAt: now,
      endedAt: null,
      clockEndsAt: config.suddenDeath ? null : now + RUSH_START_MS,
      bands,
      current: null,
      answers: [],
      score: 0,
      streak: 0,
      bestStreak: 0,
    }
    return drawNext(state)
  },

  reduce(state, event, geo) {
    if (state.endedAt !== null) return state
    switch (event.type) {
      case 'tick':
        return state.clockEndsAt !== null && event.at >= state.clockEndsAt
          ? { ...state, endedAt: state.clockEndsAt }
          : state
      case 'next':
        return state
      case 'skip':
        if (event.playerId !== state.player || state.config.suddenDeath) return state
        return answer(state, skipAnswer(state, event.at))
      case 'submit': {
        const { pin, at } = event.submission
        if (event.playerId !== state.player || !pin || !state.current) return state
        if (state.clockEndsAt !== null && at >= state.clockEndsAt) return state
        return answer(state, pinAnswer(state, geo, pin, at))
      }
    }
  },

  isFinished: (state) => state.endedAt !== null,

  deadline: (state) => (state.endedAt === null ? state.clockEndsAt : null),

  outcomesBetween(previous, next) {
    return next.answers.slice(previous.answers.length).flatMap(outcomeOf)
  },

  summarize(state) {
    return {
      mode: 'rush',
      bestKey: rushBestKey(state.config),
      seed: state.seed,
      startedAt: state.startedAt,
      endedAt: state.endedAt ?? state.startedAt,
      score: state.score,
      maxScore: null,
      outcomes: state.answers.flatMap(outcomeOf),
      metrics: {
        found: state.answers.filter((a) => a.outcome === 'hit').length,
        bestStreak: state.bestStreak,
        suddenDeath: state.config.suddenDeath ? 1 : 0,
      },
    }
  },
}

function pinAnswer(state: RushState, geo: GeoData, pin: LonLat, at: number): RushAnswer {
  const targetId = state.current!
  const target = geo.feature(targetId)
  const { distanceKm, nearest } = nearestPointOnCountry(pin, target)
  const { hit } = scoreGuess(distanceKm, target.properties, state.config.region)
  const near = !hit && distanceKm <= ZERO_POINTS_DISTANCE_KM[state.config.region] * NEAR_SHARE
  const streak = hit ? state.streak + 1 : state.streak
  const multiplier = rushMultiplier(streak)
  const outcome: RushOutcome = hit ? 'hit' : near ? 'near' : 'miss'
  return {
    targetId,
    outcome,
    points: hit ? RUSH_HIT_POINTS * multiplier : near ? RUSH_NEAR_POINTS * multiplier : 0,
    multiplier,
    timeDeltaMs: hit ? RUSH_HIT_BONUS_MS : near ? 0 : -RUSH_MISS_PENALTY_MS,
    guess: pin,
    nearest,
    clickedId: geo.countries.countryAt(pin)?.properties.id ?? null,
    distanceKm,
    at,
  }
}

function skipAnswer(state: RushState, at: number): RushAnswer {
  return {
    targetId: state.current!,
    outcome: 'skip',
    points: 0,
    multiplier: 1,
    timeDeltaMs: -RUSH_SKIP_PENALTY_MS,
    guess: null,
    nearest: null,
    clickedId: null,
    distanceKm: null,
    at,
  }
}

function answer(state: RushState, entry: RushAnswer): RushState {
  // A near miss keeps the streak alive without growing it.
  const streak =
    entry.outcome === 'hit' ? state.streak + 1 : entry.outcome === 'near' ? state.streak : 0
  let clockEndsAt = state.clockEndsAt
  if (clockEndsAt !== null) {
    clockEndsAt = Math.min(clockEndsAt + entry.timeDeltaMs, entry.at + RUSH_MAX_BANK_MS)
  }
  const next: RushState = {
    ...state,
    answers: [...state.answers, entry],
    score: state.score + entry.points,
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    clockEndsAt,
  }
  const failed = entry.outcome === 'miss' || entry.outcome === 'skip'
  if (state.config.suddenDeath && failed) return { ...next, endedAt: entry.at }
  if (clockEndsAt !== null && clockEndsAt <= entry.at) return { ...next, endedAt: clockEndsAt }
  return drawNext(next, entry.at)
}

/** Takes the next target from the band for the current level, or the nearest band with any left. */
function drawNext(state: RushState, at = state.startedAt): RushState {
  const hits = state.answers.filter((a) => a.outcome === 'hit').length
  const level = Math.min(BANDS - 1, Math.floor(hits / RUSH_HITS_PER_LEVEL))
  const order = [level, ...Array.from({ length: BANDS }, (_, i) => i).filter((i) => i !== level)]
  const band = order.find((i) => state.bands[i].length > 0)
  if (band === undefined) return { ...state, current: null, endedAt: at }
  const bands = state.bands.map((ids, i) => (i === band ? ids.slice(1) : ids))
  return { ...state, bands, current: state.bands[band][0] }
}

function outcomeOf(answer: RushAnswer): CountryOutcome[] {
  if (answer.outcome === 'skip') return []
  return [
    {
      countryId: answer.targetId,
      skill: 'locate',
      success: answer.outcome === 'hit',
      distanceKm: answer.distanceKm ?? undefined,
    },
  ]
}
