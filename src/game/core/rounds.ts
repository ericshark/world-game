import type { SessionEvent } from './mode'
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
  /** Set while the clock is stopped; the deadline moves on by the paused time when it resumes. */
  pausedAt: number | null
  /** Once someone submits, everyone else has at most this long left (multiplayer tension). */
  hurryMs: number | null
  /** One entry per opened round; hidden from other players until the reveal. */
  submissions: Record<PlayerId, Submission>[]
  /** One entry per revealed round. */
  results: Record<PlayerId, RoundResult>[]
}

/** Scores one player's submission, or a missing one when the round timed out. */
export type Evaluate<C extends Challenge> = (
  challenge: C,
  submission: Submission | undefined,
  playerId: PlayerId,
) => RoundResult

interface StartOptions {
  players: PlayerId[]
  now: number
  roundTimeMs?: number | null
  hurryMs?: number | null
}

export function startRounds<C extends Challenge>(
  challenges: C[],
  { players, now, roundTimeMs = null, hurryMs = null }: StartOptions,
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
    pausedAt: null,
    hurryMs,
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
  // While paused, time stands still at the moment the clock stopped.
  const at = Math.min(submission.at, state.pausedAt ?? Infinity)
  if (state.deadline !== null && at > state.deadline) return state

  const submissions = [...state.submissions]
  submissions[state.round] = { ...submissions[state.round], [playerId]: submission }
  const everyone = state.players.every((player) => submissions[state.round][player])
  if (everyone) return reveal({ ...state, submissions }, evaluate)
  const first = Object.keys(submissions[state.round]).length === 1
  const hurried =
    first && state.hurryMs !== null
      ? Math.min(state.deadline ?? Infinity, submission.at + state.hurryMs)
      : state.deadline
  return { ...state, submissions, deadline: hurried }
}

/** Closes the round once its deadline has passed; players who did not submit get nothing. */
export function expireRound<C extends Challenge>(
  state: RoundsState<C>,
  now: number,
  evaluate: Evaluate<C>,
): RoundsState<C> {
  if (state.phase !== 'open' || state.deadline === null || state.pausedAt !== null) return state
  if (now < state.deadline) return state
  return reveal(state, evaluate)
}

export function pauseRounds<C extends Challenge>(state: RoundsState<C>, at: number) {
  if (state.pausedAt !== null || state.phase !== 'open' || state.deadline === null) return state
  return { ...state, pausedAt: at }
}

export function resumeRounds<C extends Challenge>(state: RoundsState<C>, at: number) {
  if (state.pausedAt === null) return state
  const paused = Math.max(0, at - state.pausedAt)
  const deadline = state.deadline === null ? null : state.deadline + paused
  return { ...state, deadline, pausedAt: null }
}

/** When the host must tick for the open round to time out, or null if nothing is running. */
export function roundsDeadline<C extends Challenge>(state: RoundsState<C>): number | null {
  return state.pausedAt === null ? state.deadline : null
}

/** The events every round-based mode handles the same way. */
export function reduceRounds<C extends Challenge>(
  state: RoundsState<C>,
  event: SessionEvent,
  evaluate: Evaluate<C>,
): RoundsState<C> {
  switch (event.type) {
    case 'submit':
      return submitRound(state, event.playerId, event.submission, evaluate)
    case 'tick':
      return expireRound(state, event.at, evaluate)
    case 'next':
      return advanceRound(state, event.at)
    case 'pause':
      return pauseRounds(state, event.at)
    case 'resume':
      return resumeRounds(state, event.at)
  }
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
    pausedAt: null,
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
 * What one player may see: while a round is open, other players' submissions show only that
 * they answered (and when), never the pin or answer, so nobody can copy before the reveal.
 */
export function roundsViewFor<C extends Challenge>(
  state: RoundsState<C>,
  playerId: PlayerId,
): RoundsState<C> {
  if (state.phase !== 'open') return state
  const open = state.submissions[state.round]
  const visible = Object.fromEntries(
    Object.entries(open).map(([id, submission]) => [
      id,
      id === playerId ? submission : { at: submission.at },
    ]),
  )
  return { ...state, submissions: [...state.submissions.slice(0, -1), visible] }
}

function reveal<C extends Challenge>(state: RoundsState<C>, evaluate: Evaluate<C>): RoundsState<C> {
  const challenge = state.challenges[state.round]
  const submissions = state.submissions[state.round]
  const results = Object.fromEntries(
    state.players.map((player) => [player, evaluate(challenge, submissions[player], player)]),
  )
  return {
    ...state,
    phase: 'revealed',
    deadline: null,
    pausedAt: null,
    results: [...state.results, results],
  }
}
