import type { GeoData } from '../../geo/facts'
import { MAX_POINTS } from '../../geo/scoring'
import { evaluateChallenge, skillOf } from '../core/evaluate'
import type { ModeRules, SessionEvent } from '../core/mode'
import { createRandom, type Random } from '../core/random'
import {
  advanceRound,
  expireRound,
  playerResults,
  roundsViewFor,
  startRounds,
  submitRound,
  type Evaluate,
  type RoundsState,
} from '../core/rounds'
import { pickWeighted, targetPool, weightByDifficulty } from '../core/targets'
import type { Challenge, CountryOutcome, PlayerId, RoundResult } from '../core/types'
import { botAnswerTime, botSubmission, type BotSkill } from './bots'
import { pickCategories, usedAnswers } from './rareEarth'

export type BattleFormat = 'duel' | 'party' | 'survival' | 'teams'
export type BattleContent = 'pinpoint' | 'mixed'
export type Team = 'A' | 'B'

export interface BattlePlayer {
  id: PlayerId
  name: string
  color: string
  team?: Team
  /** Set for computer opponents. */
  bot?: BotSkill
}

export interface BattleConfig {
  format: BattleFormat
  content: BattleContent
  roster: BattlePlayer[]
}

export const BATTLE_ROUND_MS = 25_000
/** Once someone answers, the others have this long. */
export const BATTLE_HURRY_MS = 10_000
/** How long the reveal stays up before the next round, unless everyone is ready sooner. */
export const BATTLE_REVEAL_MS = 8_000
export const START_HP = 6_000
export const START_LIVES = 3
const MAX_ROUNDS: Record<BattleFormat, number> = { duel: 15, teams: 15, party: 10, survival: 20 }

/** What happened in a round, beyond each player's own result. */
export interface BattleReport {
  /** Points per player after shared Rare Earth answers are split. */
  points: Record<PlayerId, number>
  /** Duel and teams: HP lost, by player or team. */
  damage: Record<string, number>
  multiplier: number
  /** Survival: who lost a life, and who is out. */
  lostLife: PlayerId[]
  eliminated: PlayerId[]
}

export interface BattleState {
  config: BattleConfig
  seed: string
  startedAt: number
  endedAt: number | null
  rounds: RoundsState<Challenge>
  /** Duel: by player. Teams: by team. */
  hp: Record<string, number>
  lives: Record<PlayerId, number>
  /** Players still in the game. */
  active: PlayerId[]
  reports: BattleReport[]
  revealedAt: number | null
  /** Players ready for the next round (bots always are). */
  ready: PlayerId[]
  /** The game has been decided; it ends when this reveal is over. */
  decided: boolean
}

export type BattleEvent = SessionEvent | { type: 'ready'; playerId: PlayerId; at: number }

/** Duel damage multiplier: two rounds at ×1, then +0.5 a round. */
export function damageMultiplier(round: number): number {
  return round < 2 ? 1 : 1 + 0.5 * (round - 1)
}

export function battleBestKey(config: Pick<BattleConfig, 'format'>): string {
  return `battle:${config.format}`
}

/**
 * Competitive mode: everyone gets the same challenges, answers in secret against a shared
 * clock, and sees everyone's answers revealed together. Bots are players whose answers the
 * rules work out themselves, so a host only needs to send ticks.
 */
export const battle: ModeRules<BattleConfig, BattleState, BattleEvent> = {
  start({ config, seed, now, geo }) {
    const ids = config.roster.map((p) => p.id)
    return {
      config,
      seed,
      startedAt: now,
      endedAt: null,
      rounds: startRounds(battleChallenges(geo, config, createRandom(seed)), {
        players: ids,
        now,
        roundTimeMs: BATTLE_ROUND_MS,
        hurryMs: BATTLE_HURRY_MS,
      }),
      hp:
        config.format === 'duel'
          ? Object.fromEntries(ids.map((id) => [id, START_HP]))
          : config.format === 'teams'
            ? { A: START_HP, B: START_HP }
            : {},
      lives:
        config.format === 'survival' ? Object.fromEntries(ids.map((id) => [id, START_LIVES])) : {},
      active: ids,
      reports: [],
      revealedAt: null,
      ready: [],
      decided: false,
    }
  },

  reduce(state, event, geo) {
    if (state.endedAt !== null) return state
    const evaluate: Evaluate<Challenge> = (challenge, submission, playerId) =>
      evaluateChallenge(geo, challenge, submission, {
        region: 'World',
        cutoffScale: 1,
        usedAnswers: usedAnswers(state.rounds, playerId),
      })

    switch (event.type) {
      case 'submit': {
        if (!state.active.includes(event.playerId) || isBot(state, event.playerId)) return state
        const rounds = submitRound(state.rounds, event.playerId, event.submission, evaluate)
        return afterStep(state, rounds, event.submission.at)
      }
      case 'tick': {
        if (state.rounds.phase === 'revealed') {
          return state.revealedAt !== null && event.at >= state.revealedAt + BATTLE_REVEAL_MS
            ? advance(state, event.at)
            : state
        }
        // Bots answer when their thinking time is up; then the clock may run out.
        let rounds = state.rounds
        for (const { playerId, submission } of dueBotAnswers(state, geo, event.at)) {
          rounds = submitRound(rounds, playerId, submission, evaluate)
        }
        if (rounds.phase === 'open') rounds = expireRound(rounds, event.at, evaluate)
        return afterStep(state, rounds, event.at)
      }
      case 'ready': {
        if (state.rounds.phase !== 'revealed' || state.ready.includes(event.playerId)) return state
        const ready = [...state.ready, event.playerId]
        const next = { ...state, ready }
        return state.config.roster.every((p) => ready.includes(p.id))
          ? advance(next, event.at)
          : next
      }
      case 'next':
        return state
    }
  },

  isFinished: (state) => state.endedAt !== null,

  deadline(state) {
    if (state.endedAt !== null) return null
    if (state.rounds.phase === 'revealed') {
      return state.revealedAt === null ? null : state.revealedAt + BATTLE_REVEAL_MS
    }
    const botTimes = pendingBots(state).map((bot) => plannedAt(state, bot))
    return Math.min(state.rounds.deadline ?? Infinity, ...botTimes)
  },

  outcomesBetween(previous, next, playerId) {
    return next.rounds.results.slice(previous.rounds.results.length).flatMap((round, offset) => {
      const result = round[playerId]
      const challenge = next.rounds.challenges[previous.rounds.results.length + offset]
      return result ? outcomeOf(challenge, result) : []
    })
  },

  summarize(state, playerId) {
    const standing = standings(state)
    const mine = standing.find((s) => s.id === playerId)
    const won = isWinner(state, playerId)
    return {
      mode: 'battle',
      bestKey: battleBestKey(state.config),
      seed: state.seed,
      startedAt: state.startedAt,
      endedAt: state.endedAt ?? state.startedAt,
      score: totalPoints(state, playerId),
      maxScore: state.reports.length * MAX_POINTS,
      outcomes: playerResults(state.rounds, playerId).flatMap((result, i) =>
        outcomeOf(state.rounds.challenges[i], result),
      ),
      metrics: {
        won: won ? 1 : 0,
        placement: mine?.place ?? standing.length,
        flawless: state.config.format === 'duel' && state.hp[playerId] === START_HP ? 1 : 0,
      },
    }
  },
}

/**
 * What one player may see. A server sends each player only this, so nothing in it can be used
 * to cheat: other players' answers stay hidden until the reveal, later rounds are not sent at
 * all, and an open Rare Earth round does not carry its list of valid answers.
 */
export function battleViewFor(state: BattleState, playerId: PlayerId): BattleState {
  const rounds = roundsViewFor(state.rounds, playerId)
  const challenges = rounds.challenges
    .slice(0, rounds.round + 1)
    .map((challenge, index) =>
      index === rounds.round && rounds.phase === 'open' && challenge.kind === 'category'
        ? { ...challenge, category: { ...challenge.category, valid: [], lenient: [] } }
        : challenge,
    )
  return { ...state, rounds: { ...rounds, challenges } }
}

/** Points a player has scored so far (after shared answers were split). */
export function totalPoints(state: BattleState, playerId: PlayerId): number {
  return state.reports.reduce((sum, report) => sum + (report.points[playerId] ?? 0), 0)
}

export interface Standing {
  id: PlayerId
  place: number
  points: number
  hp?: number
  lives?: number
  out: boolean
}

/** Who is ahead, by the format's rules. Equal players share a place. */
export function standings(state: BattleState): Standing[] {
  const { format, roster } = state.config
  const eliminatedAt = (id: PlayerId) =>
    state.reports.findIndex((report) => report.eliminated.includes(id))
  const key = (id: PlayerId): number[] => {
    const points = totalPoints(state, id)
    const player = roster.find((p) => p.id === id)!
    switch (format) {
      case 'duel':
        return [state.hp[id], points]
      case 'teams':
        return [state.hp[player.team ?? 'A'], points]
      case 'survival': {
        const out = eliminatedAt(id)
        return [out === -1 ? Infinity : out, state.lives[id], points]
      }
      case 'party':
        return [points]
    }
  }
  const sorted = roster
    .map((p) => ({ id: p.id, key: key(p.id) }))
    .sort((a, b) => compareKeys(b.key, a.key))
  return sorted.map(({ id, key: k }) => ({
    id,
    place: 1 + sorted.filter((other) => compareKeys(other.key, k) > 0).length,
    points: totalPoints(state, id),
    hp:
      format === 'duel'
        ? state.hp[id]
        : format === 'teams'
          ? state.hp[roster.find((p) => p.id === id)!.team ?? 'A']
          : undefined,
    lives: format === 'survival' ? state.lives[id] : undefined,
    out: !state.active.includes(id),
  }))
}

export function isWinner(state: BattleState, playerId: PlayerId): boolean {
  if (state.config.format === 'teams') {
    const team = state.config.roster.find((p) => p.id === playerId)?.team
    const other = team === 'A' ? 'B' : 'A'
    return team !== undefined && state.hp[team] > state.hp[other]
  }
  return standings(state).find((s) => s.id === playerId)?.place === 1
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

/** Seeded challenges for the whole game; mixed games rotate through every kind. */
function battleChallenges(geo: GeoData, config: BattleConfig, random: Random): Challenge[] {
  const count = MAX_ROUNDS[config.format]
  const pool = targetPool(geo.countries.features, { region: 'World', skipMicro: true }).map(
    (f) => f.properties.id,
  )
  const countries = pickWeighted(weightByDifficulty(pool, 'normal', geo), count, random)
  if (config.content === 'pinpoint') {
    return countries.map((countryId) => ({ kind: 'locate', countryId }))
  }
  const categories = pickCategories(geo, Math.ceil(count / 4), random)
  const kinds = ['locate', 'capital', 'identify', 'category'] as const
  return countries.map((countryId, i): Challenge => {
    const kind = kinds[i % kinds.length]
    if (kind === 'category') return { kind, category: categories[Math.floor(i / 4)] }
    if (kind === 'identify') return { kind, countryId, choices: null }
    return { kind, countryId }
  })
}

function isBot(state: BattleState, playerId: PlayerId): boolean {
  return Boolean(state.config.roster.find((p) => p.id === playerId)?.bot)
}

function pendingBots(state: BattleState): BattlePlayer[] {
  if (state.rounds.phase !== 'open') return []
  const submitted = state.rounds.submissions[state.rounds.round]
  return state.config.roster.filter((p) => p.bot && state.active.includes(p.id) && !submitted[p.id])
}

function botSeed(state: BattleState, bot: BattlePlayer) {
  return `${state.seed}:${state.rounds.round}:${bot.id}`
}

/** Bots, like people, rush to answer when the clock is cut short. */
const BOT_RUSH_MARGIN_MS = 800

function plannedAt(state: BattleState, bot: BattlePlayer): number {
  const relaxed = botAnswerTime(bot.bot!, botSeed(state, bot), state.rounds.openedAt)
  return Math.min(relaxed, (state.rounds.deadline ?? Infinity) - BOT_RUSH_MARGIN_MS)
}

/** Bots whose thinking time is up, with their answers, earliest first. */
function dueBotAnswers(state: BattleState, geo: GeoData, now: number) {
  const challenge = state.rounds.challenges[state.rounds.round]
  return pendingBots(state)
    .filter((bot) => plannedAt(state, bot) <= now)
    .map((bot) => ({
      playerId: bot.id,
      submission: {
        ...botSubmission(geo, challenge, bot.bot!, botSeed(state, bot), state.rounds.openedAt),
        at: plannedAt(state, bot),
      },
    }))
    .sort((a, b) => a.submission.at - b.submission.at)
}

/** After any change to the rounds: if a round was just revealed, score it for the format. */
function afterStep(state: BattleState, rounds: RoundsState<Challenge>, at: number): BattleState {
  if (rounds === state.rounds) return state
  const justRevealed = rounds.phase === 'revealed' && state.rounds.phase === 'open'
  const next = { ...state, rounds }
  return justRevealed ? scoreRound(next, at) : next
}

function scoreRound(state: BattleState, at: number): BattleState {
  const { rounds, config } = state
  const index = rounds.round
  const results = shareAnswers(rounds.results[index])
  const allResults = [...rounds.results.slice(0, index), results]
  const points = Object.fromEntries(state.active.map((id) => [id, results[id]?.points ?? 0]))
  const multiplier = damageMultiplier(index)
  const report: BattleReport = { points, damage: {}, multiplier, lostLife: [], eliminated: [] }
  const hp = { ...state.hp }
  const lives = { ...state.lives }
  let active = state.active

  if (config.format === 'duel' || config.format === 'teams') {
    const sides =
      config.format === 'duel'
        ? state.active.map((id) => ({ side: id, score: points[id] }))
        : (['A', 'B'] as const).map((team) => {
            const members = config.roster.filter((p) => p.team === team && active.includes(p.id))
            const total = members.reduce((sum, p) => sum + points[p.id], 0)
            return { side: team, score: members.length ? total / members.length : 0 }
          })
    if (sides.length === 2 && sides[0].score !== sides[1].score) {
      const [loser, winner] = sides[0].score < sides[1].score ? sides : [sides[1], sides[0]]
      const damage = Math.round((winner.score - loser.score) * multiplier)
      hp[loser.side] = Math.max(0, hp[loser.side] - damage)
      report.damage[loser.side] = damage
    }
  } else if (config.format === 'survival') {
    const lowest = Math.min(...active.map((id) => points[id]))
    const losers = active.filter((id) => points[id] === lowest)
    // If everyone would be knocked out together, nobody is.
    const wouldRemain = active.filter((id) => !losers.includes(id) || lives[id] > 1)
    if (losers.length < active.length || wouldRemain.length > 0) {
      for (const id of losers) lives[id] -= 1
      report.lostLife = losers
      report.eliminated = losers.filter((id) => lives[id] <= 0)
      active = active.filter((id) => !report.eliminated.includes(id))
    }
  }

  const lastRound = index + 1 >= rounds.challenges.length
  const decided =
    lastRound ||
    (config.format === 'survival' && active.length <= 1) ||
    ((config.format === 'duel' || config.format === 'teams') &&
      Object.values(hp).some((v) => v <= 0))

  return {
    ...state,
    rounds: { ...rounds, results: allResults },
    hp,
    lives,
    active,
    reports: [...state.reports, report],
    revealedAt: at,
    ready: config.roster.filter((p) => p.bot).map((p) => p.id),
    decided,
  }
}

/**
 * Rare Earth answers are worth more when nobody else gave them: players who gave the same valid
 * answer split its points.
 */
function shareAnswers(results: Record<PlayerId, RoundResult>): Record<PlayerId, RoundResult> {
  const counts = new Map<string, number>()
  for (const result of Object.values(results)) {
    if (result.kind === 'category' && result.valid) {
      counts.set(result.answerId, (counts.get(result.answerId) ?? 0) + 1)
    }
  }
  return Object.fromEntries(
    Object.entries(results).map(([id, result]) => {
      if (result.kind !== 'category' || !result.valid) return [id, result]
      const sharedBy = counts.get(result.answerId) ?? 1
      return [id, { ...result, points: Math.round(result.points / sharedBy) }]
    }),
  )
}

function advance(state: BattleState, at: number): BattleState {
  if (state.decided) {
    return { ...state, rounds: { ...state.rounds, phase: 'finished' }, endedAt: at }
  }
  const rounds = advanceRound({ ...state.rounds, players: state.active }, at)
  return { ...state, rounds, revealedAt: null, ready: [] }
}

function outcomeOf(challenge: Challenge, result: RoundResult): CountryOutcome[] {
  if (result.kind === 'missed') return []
  if (result.kind === 'category') {
    return [{ countryId: result.answerId, skill: 'recall', success: result.valid }]
  }
  return [
    {
      countryId: result.targetId,
      skill: skillOf(challenge),
      success: result.hit,
      distanceKm: 'distanceKm' in result ? result.distanceKm : undefined,
    },
  ]
}
