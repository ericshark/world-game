import { MAX_POINTS } from '../../geo/scoring'
import type { GeoData } from '../../geo/facts'
import { buildCategories, rarityTier, type Category } from '../core/categories'
import { evaluateChallenge, type ScoringOptions } from '../core/evaluate'
import type { ModeRules } from '../core/mode'
import { createRandom, shuffled, type Random } from '../core/random'
import {
  advanceRound,
  expireRound,
  playerResults,
  startRounds,
  submitRound,
  totalPoints,
  type Evaluate,
  type RoundsState,
} from '../core/rounds'
import type {
  CategoryChallenge,
  Challenge,
  CountryOutcome,
  PlayerId,
  RoundResult,
} from '../core/types'

export const RARE_EARTH_ROUNDS = 5

export interface RareEarthConfig {
  /** Hard hides name suggestions and gives 45 seconds a round. */
  difficulty: 'normal' | 'hard'
}

export const DEFAULT_RARE_EARTH_CONFIG: RareEarthConfig = { difficulty: 'normal' }
export const RARE_EARTH_HARD_ROUND_MS = 45_000

export interface RareEarthState {
  config: RareEarthConfig
  seed: string
  startedAt: number
  endedAt: number | null
  rounds: RoundsState<CategoryChallenge>
}

export function rareEarthBestKey(config: RareEarthConfig): string {
  return `rare-earth:${config.difficulty}`
}

/**
 * Picks categories from different kinds (a landlocked one, a border one, a coast one…) so a
 * game is varied rather than five lists of neighbours.
 */
export function pickCategories(geo: GeoData, count: number, random: Random): Category[] {
  const byKind = new Map<string, Category[]>()
  for (const category of buildCategories(geo)) {
    byKind.set(category.kind, [...(byKind.get(category.kind) ?? []), category])
  }
  const kinds = shuffled([...byKind.keys()], random)
  const picked: Category[] = []
  for (let i = 0; i < count; i++) {
    const options = byKind.get(kinds[i % kinds.length])!
    const unused = options.filter((option) => !picked.includes(option))
    picked.push(shuffled(unused.length > 0 ? unused : options, random)[0])
  }
  return picked
}

/**
 * Knowledge mode: name a country that fits the category (the rarer the better), then find it
 * on the globe. Each answer can be used once per game.
 */
export const rareEarth: ModeRules<RareEarthConfig, RareEarthState> = {
  start({ config, seed, now, geo, players }) {
    const categories = pickCategories(geo, RARE_EARTH_ROUNDS, createRandom(seed))
    return {
      config,
      seed,
      startedAt: now,
      endedAt: null,
      rounds: startRounds(
        categories.map((category) => ({ kind: 'category' as const, category })),
        {
          players,
          now,
          roundTimeMs: config.difficulty === 'hard' ? RARE_EARTH_HARD_ROUND_MS : null,
        },
      ),
    }
  },

  reduce(state, event, geo) {
    // Reusing a country named in an earlier round does not count.
    const evaluate: Evaluate<CategoryChallenge> = (challenge, submission, playerId) => {
      const options: ScoringOptions = {
        region: 'World',
        cutoffScale: 1,
        usedAnswers: usedAnswers(state.rounds, playerId),
      }
      return evaluateChallenge(geo, challenge, submission, options)
    }

    switch (event.type) {
      case 'submit':
        return {
          ...state,
          rounds: submitRound(state.rounds, event.playerId, event.submission, evaluate),
        }
      case 'tick':
        return { ...state, rounds: expireRound(state.rounds, event.at, evaluate) }
      case 'next': {
        const rounds = advanceRound(state.rounds, event.at)
        return { ...state, rounds, endedAt: rounds.phase === 'finished' ? event.at : null }
      }
    }
  },

  isFinished: (state) => state.rounds.phase === 'finished',

  deadline: (state) => state.rounds.deadline,

  outcomesBetween(previous, next, playerId) {
    return next.rounds.results
      .slice(previous.rounds.results.length)
      .flatMap((round) => outcomeOf(round[playerId]))
  },

  summarize(state, playerId) {
    return {
      mode: 'rare-earth',
      bestKey: rareEarthBestKey(state.config),
      seed: state.seed,
      startedAt: state.startedAt,
      endedAt: state.endedAt ?? state.startedAt,
      score: totalPoints(state.rounds, playerId),
      maxScore: state.rounds.challenges.length * MAX_POINTS,
      outcomes: playerResults(state.rounds, playerId).flatMap(outcomeOf),
      metrics: rareEarthMetrics(playerResults(state.rounds, playerId)),
    }
  },
}

/** Countries a player has already named in earlier rounds. */
export function usedAnswers(rounds: RoundsState<Challenge>, playerId: PlayerId): string[] {
  return playerResults(rounds, playerId).flatMap((result) =>
    result.kind === 'category' ? [result.answerId] : [],
  )
}

function rareEarthMetrics(results: RoundResult[]) {
  const valid = results.filter((r) => r.kind === 'category' && r.valid)
  return {
    valid: valid.length,
    legendary: valid.filter((r) => r.kind === 'category' && rarityTier(r.rarity) === 'Legendary')
      .length,
  }
}

function outcomeOf(result: RoundResult): CountryOutcome[] {
  if (result.kind !== 'category') return []
  return [
    {
      countryId: result.answerId,
      skill: 'recall',
      success: result.valid,
      distanceKm: result.distanceKm,
    },
  ]
}
