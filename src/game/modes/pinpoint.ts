import { cityKey, type CityIndex } from '../../geo/cities'
import type { GeoData } from '../../geo/facts'
import { MAX_POINTS, type ScoringRegion } from '../../geo/scoring'
import { subPlaceKey, type SubPackId, type SubdivisionPack } from '../../geo/subdivisions'
import { mistakenFor } from '../core/confusions'
import { evaluateChallenge, type ScoringOptions } from '../core/evaluate'
import type { ModeRules } from '../core/mode'
import { createRandom, type Random } from '../core/random'
import {
  reduceRounds,
  roundsDeadline,
  startRounds,
  totalPoints,
  type RoundsState,
} from '../core/rounds'
import {
  flagChoices,
  nameChoices,
  pickWeighted,
  targetPool,
  weightByDifficulty,
  weightByPractice,
  weightCitiesByDifficulty,
  type Difficulty,
} from '../core/targets'
import type { CountryChallenge, CountryOutcome, RoundResult, Skill } from '../core/types'
import type { StatsByCountry } from '../profile/stats'

export const ROUNDS_PER_GAME = 10

export type PinpointTarget = 'countries' | 'capitals' | 'cities' | 'flags' | 'subdivisions'
/**
 * Find a named place on the globe, or name the place highlighted on it. With the Flags target,
 * "find" shows a flag to place on the globe and "name" shows a country and asks for its flag.
 */
export type PinpointVariant = 'find' | 'name'

export interface PinpointConfig {
  region: ScoringRegion
  /** The country pack used when `target` is `'subdivisions'`. */
  subPack?: SubPackId
  difficulty: Difficulty
  target: PinpointTarget
  variant: PinpointVariant
  /** Play on the night-lights globe. */
  night: boolean
  skipMicro: boolean
  practiceWeak: boolean
}

export const DEFAULT_PINPOINT_CONFIG: PinpointConfig = {
  region: 'World',
  subPack: 'USA',
  difficulty: 'normal',
  target: 'countries',
  variant: 'find',
  night: false,
  skipMicro: false,
  practiceWeak: false,
}

export const DIFFICULTY_RULES: Record<
  Difficulty,
  { cutoffScale: number; roundTimeMs: number | null }
> = {
  easy: { cutoffScale: 1.4, roundTimeMs: null },
  normal: { cutoffScale: 1, roundTimeMs: null },
  hard: { cutoffScale: 0.75, roundTimeMs: 20_000 },
}

export interface PinpointState {
  config: PinpointConfig
  seed: string
  startedAt: number
  endedAt: number | null
  rounds: RoundsState<CountryChallenge>
}

/** Games with the same key are comparable for personal bests. */
export function pinpointBestKey(config: PinpointConfig): string {
  const {
    target,
    variant,
    region,
    subPack = 'USA',
    difficulty,
    skipMicro,
    night,
    practiceWeak,
  } = config
  if (target === 'subdivisions') {
    const flags = [night && 'night', practiceWeak && 'practice']
    const kind = variant === 'name' ? 'sub-name' : 'sub'
    return ['pinpoint', kind, subPack, difficulty, ...flags.filter(Boolean)].join(':')
  }
  const isCities = target === 'cities' && variant !== 'name'
  const flags = [skipMicro && !isCities && 'no-micro', night && 'night', practiceWeak && 'practice']
  const kind =
    target === 'flags'
      ? variant === 'name'
        ? 'flags-pick'
        : 'flags'
      : variant === 'name'
        ? 'name'
        : target
  return ['pinpoint', kind, region, difficulty, ...flags.filter(Boolean)].join(':')
}

/** The skill a Pinpoint game trains, for stats and weak-country practice. */
export function pinpointSkill(config: PinpointConfig): Skill {
  if (config.target === 'flags') return 'flag'
  if (config.variant === 'name') return 'name'
  if (config.target === 'capitals') return 'capital'
  return config.target === 'cities' ? 'city' : 'locate'
}

/** Classic mode: find each named country (or capital) on the globe, or name the one shown. */
export const pinpoint: ModeRules<PinpointConfig, PinpointState> = {
  start({ config, seed, now, geo, cities, subdivisions, players, stats }) {
    const random = createRandom(seed)
    const challenges: CountryChallenge[] =
      config.target === 'subdivisions'
        ? buildSubdivisionChallenges(config, subdivisions, stats, random)
        : config.target === 'cities' && config.variant !== 'name'
          ? buildCityChallenges(config, geo, cities, stats, random)
          : buildCountryChallenges(config, geo, stats, random)
    return {
      config,
      seed,
      startedAt: now,
      endedAt: null,
      rounds: startRounds(challenges, {
        players,
        now,
        roundTimeMs: DIFFICULTY_RULES[config.difficulty].roundTimeMs,
      }),
    }
  },

  reduce(state, event, geo, subdivisions) {
    const pack =
      state.config.target === 'subdivisions'
        ? subdivisions?.[state.config.subPack ?? 'USA']
        : undefined
    const options: ScoringOptions = {
      region: state.config.region,
      cutoffScale: DIFFICULTY_RULES[state.config.difficulty].cutoffScale,
      zeroPointsKm: pack?.zeroPointsKm,
    }
    const evaluate = (
      challenge: CountryChallenge,
      submission: Parameters<typeof evaluateChallenge>[2],
    ) => evaluateChallenge(geo, challenge, submission, options, pack)

    const rounds = reduceRounds(state.rounds, event, evaluate)
    if (rounds === state.rounds) return state
    const ended = rounds.phase === 'finished' && event.type === 'next'
    return { ...state, rounds, endedAt: ended ? event.at : state.endedAt }
  },

  isFinished: (state) => state.rounds.phase === 'finished',

  deadline: (state) => roundsDeadline(state.rounds),

  outcomesBetween(previous, next, playerId) {
    const skill = pinpointSkill(next.config)
    const offset = previous.rounds.results.length
    return next.rounds.results
      .slice(offset)
      .map((round, i) => outcomeOf(next.rounds.challenges[offset + i], round[playerId], skill))
  },

  summarize(state, playerId) {
    const skill = pinpointSkill(state.config)
    return {
      mode: 'pinpoint',
      bestKey: pinpointBestKey(state.config),
      seed: state.seed,
      startedAt: state.startedAt,
      endedAt: state.endedAt ?? state.startedAt,
      score: totalPoints(state.rounds, playerId),
      maxScore: state.rounds.challenges.length * MAX_POINTS,
      outcomes: state.rounds.results.map((round, i) =>
        outcomeOf(state.rounds.challenges[i], round[playerId], skill),
      ),
      metrics: { hits: state.rounds.results.filter((round) => round[playerId].hit).length },
    }
  },
}

function buildSubdivisionChallenges(
  config: PinpointConfig,
  subdivisions: Partial<Record<SubPackId, SubdivisionPack>> | undefined,
  stats: StatsByCountry | undefined,
  random: Random,
): CountryChallenge[] {
  const packId = config.subPack ?? 'USA'
  const pack = subdivisions?.[packId]
  if (!pack) throw new Error(`Subdivision pack ${packId} is not loaded`)
  let entries = weightByDifficulty(pack.playableIds, config.difficulty, pack)
  if (config.practiceWeak && stats) entries = weightByPractice(entries, stats)
  return pickWeighted(entries, ROUNDS_PER_GAME, random).map((unitId): CountryChallenge => {
    if (config.variant === 'name') {
      const choices = config.difficulty === 'easy' ? nameChoices(pack, unitId, random) : null
      return { kind: 'identify', countryId: unitId, choices, packId }
    }
    return { kind: 'locate', countryId: unitId, packId }
  })
}

function buildCityChallenges(
  config: PinpointConfig,
  geo: GeoData,
  cities: CityIndex | undefined,
  stats: StatsByCountry | undefined,
  random: Random,
): CountryChallenge[] {
  if (!cities) throw new Error('Cities are not loaded')
  const pool = cities.inRegion(geo, config.region)
  let entries = weightCitiesByDifficulty(pool, config.difficulty)
  if (config.practiceWeak && stats) entries = weightByPractice(entries, stats)
  return pickWeighted(entries, ROUNDS_PER_GAME, random).map((cityId): CountryChallenge => {
    const city = cities.get(cityId)!
    return {
      kind: 'city',
      cityId: city.id,
      countryId: city.countryId,
      name: city.name,
      at: city.at,
    }
  })
}

function buildCountryChallenges(
  config: PinpointConfig,
  geo: GeoData,
  stats: StatsByCountry | undefined,
  random: Random,
): CountryChallenge[] {
  const pool = targetPool(geo.countries.features, config).map((f) => f.properties.id)
  let entries = weightByDifficulty(pool, config.difficulty, geo)
  if (config.practiceWeak && stats) entries = weightByPractice(entries, stats)
  return pickWeighted(entries, ROUNDS_PER_GAME, random).map((countryId): CountryChallenge => {
    if (config.target === 'flags') {
      return config.variant === 'name'
        ? {
            kind: 'identify',
            countryId,
            choices: flagChoices(geo, countryId, random),
            show: 'flag',
          }
        : { kind: 'locate', countryId, show: 'flag' }
    }
    if (config.variant === 'name') {
      const choices = config.difficulty === 'easy' ? nameChoices(geo, countryId, random) : null
      return { kind: 'identify', countryId, choices }
    }
    return { kind: config.target === 'capitals' ? 'capital' : 'locate', countryId }
  })
}

function outcomeOf(challenge: CountryChallenge, result: RoundResult, skill: Skill): CountryOutcome {
  if ((challenge.kind === 'locate' || challenge.kind === 'identify') && challenge.packId) {
    return {
      countryId: challenge.packId,
      placeKey: subPlaceKey(challenge.packId as SubPackId, challenge.countryId),
      skill,
      success: result.hit,
      distanceKm: result.kind === 'locate' ? result.distanceKm : undefined,
    }
  }
  if (challenge.kind === 'city') {
    return {
      countryId: challenge.countryId,
      placeKey: cityKey(challenge.cityId),
      skill,
      success: result.hit,
      distanceKm: result.kind === 'city' ? result.distanceKm : undefined,
    }
  }
  return {
    countryId: result.targetId,
    skill,
    success: result.hit,
    distanceKm:
      result.kind === 'locate' || result.kind === 'capital' ? result.distanceKm : undefined,
    mistakenFor: mistakenFor(result),
  }
}
