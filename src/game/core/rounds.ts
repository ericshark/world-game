import type { Challenge, PlayerId, RoundResult, Submission } from './types'

export type RoundPhase = 'open' | 'revealed' | 'finished'

/**
 * A sequence of challenges that every player answers in lock-step. A round stays open until all
 * players have submitted or its deadline passes, then everyone's results are revealed at once.
 * Single-player games are the one-player case, so the same flow later serves multiplayer.
 */
export interface RoundsState<C extends Challenge = Challenge> {
  players: PlayerId[]
  challenges: C[]
  /** Index of the current round. */
  round: number
  phase: RoundPhase
  openedAt: number
  /** When the open round closes on its own, or null when untimed. */
  deadline: number | null
  roundTimeMs: number | null
  /** One entry per opened round; hidden from other players until the reveal. */
  submissions: Record<PlayerId, Submission>[]
  /** One entry per revealed round. */
  results: Record<PlayerId, RoundResult>[]
}

/** Scores one player's submission, or a missing one when the round timed out. */
export type Evaluate<C extends Challenge> = (
  challenge: C,
  submission: Submission | undefined,
) => RoundResult

interface StartOptions {
  players: PlayerId[]
  now: number
  roundTimeMs?: number | null
}

export function startRounds<C extends Challenge>(
  challenges: C[],
  { players, now, roundTimeMs = null }: StartOptions,
): RoundsState<C> {
  if (challenges.length === 0) throw new Error('A game needs at least one round')
  return {
    players,
    challenges,
    round: 0,
    phase: 'open',
    openedAt: now,
    deadline: roundTimeMs === null ? null : now + roundTimeMs,
    roundTimeMs,
    submissions: [{}],
    results: [],
  }
}

export function currentChallenge<C extends Challenge>(state: RoundsState<C>): C {
  return state.challenges[state.round]
}

/** Records a submission; the round is revealed once every player has submitted. */
export function submitRound<C extends Challenge>(
  state: RoundsState<C>,
  playerId: PlayerId,
  submission: Submission,
  evaluate: Evaluate<C>,
): RoundsState<C> {
  if (state.phase !== 'open' || !state.players.includes(playerId)) return state
  if (state.submissions[state.round][playerId]) return state
  if (state.deadline !== null && submission.at > state.deadline) return state

  const submissions = [...state.submissions]
  submissions[state.round] = { ...submissions[state.round], [playerId]: submission }
  const next = { ...state, submissions }
  const everyone = state.players.every((player) => submissions[state.round][player])
  return everyone ? reveal(next, evaluate) : next
}

/** Closes the round once its deadline has passed; players who did not submit get nothing. */
export function expireRound<C extends Challenge>(
  state: RoundsState<C>,
  now: number,
  evaluate: Evaluate<C>,
): RoundsState<C> {
  if (state.phase !== 'open' || state.deadline === null || now < state.deadline) return state
  return reveal(state, evaluate)
}

/** Moves from a revealed round to the next one, or finishes after the last. */
export function advanceRound<C extends Challenge>(
  state: RoundsState<C>,
  now: number,
): RoundsState<C> {
  if (state.phase !== 'revealed') return state
  if (state.round + 1 >= state.challenges.length) return { ...state, phase: 'finished' }
  return {
    ...state,
    round: state.round + 1,
    phase: 'open',
    openedAt: now,
    deadline: state.roundTimeMs === null ? null : now + state.roundTimeMs,
    submissions: [...state.submissions, {}],
  }
}

export function playerResults<C extends Challenge>(
  state: RoundsState<C>,
  playerId: PlayerId,
): RoundResult[] {
  return state.results.map((round) => round[playerId]).filter((result) => result !== undefined)
}

export function totalPoints<C extends Challenge>(
  state: RoundsState<C>,
  playerId: PlayerId,
): number {
  return playerResults(state, playerId).reduce((sum, result) => sum + result.points, 0)
}

/**
 * What one player may see: other players' submissions stay hidden while a round is open, so
 * nobody can copy a pin before the simultaneous reveal.
 */
export function roundsViewFor<C extends Challenge>(
  state: RoundsState<C>,
  playerId: PlayerId,
): RoundsState<C> {
  if (state.phase !== 'open') return state
  const open = state.submissions[state.round]
  const visible = open[playerId] ? { [playerId]: open[playerId] } : {}
  return { ...state, submissions: [...state.submissions.slice(0, -1), visible] }
}

function reveal<C extends Challenge>(state: RoundsState<C>, evaluate: Evaluate<C>): RoundsState<C> {
  const challenge = state.challenges[state.round]
  const submissions = state.submissions[state.round]
  const results = Object.fromEntries(
    state.players.map((player) => [player, evaluate(challenge, submissions[player])]),
  )
  return { ...state, phase: 'revealed', deadline: null, results: [...state.results, results] }
}
