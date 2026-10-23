import { useCallback, useEffect, useRef, useState } from 'react'
import type { GeoData } from '../geo/facts'
import type { ModeRules } from '../game/core/mode'
import {
  LOCAL_PLAYER,
  type CountryOutcome,
  type DailyPuzzle,
  type SessionSummary,
} from '../game/core/types'
import { ApiError } from '../net/api'
import { sendRankedDaily } from '../net/daily'

/** A daily puzzle played on the server, which holds the secret parts and keeps the score. */
export interface RemoteDaily {
  puzzle: DailyPuzzle
  dateKey: string
  /** What the server showed when the puzzle was opened. */
  initial: unknown
  /** The server could not be reached or refused a move. */
  onError: (message: string) => void
}

interface Callbacks {
  onOutcomes?: (outcomes: CountryOutcome[]) => void
  onFinish?: (summary: SessionSummary) => void
}

/**
 * Plays a game hosted by the server. It looks like `useLocalSession`, except that a move is
 * answered after a round trip, so `send` returns a promise. The state is always what the server
 * says a player may see; the rules run here only to describe what changed.
 */
export function useRemoteSession<Config, State, Event extends { type: string }>(
  rules: ModeRules<Config, State, Event>,
  _geo: GeoData | null,
  callbacks: Callbacks,
  remote: RemoteDaily | undefined,
) {
  const [state, setState] = useState<State | null>(() => (remote?.initial as State) ?? null)
  const stateRef = useRef(state)
  const callbacksRef = useRef(callbacks)
  const remoteRef = useRef(remote)
  useEffect(() => {
    callbacksRef.current = callbacks
    remoteRef.current = remote
  })
  // Moves are sent one at a time, in order, so the server never sees them swapped.
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  const send = useCallback(
    (event: Event): Promise<State | null> => {
      const run = async (): Promise<State | null> => {
        const previous = stateRef.current
        const target = remoteRef.current
        if (!previous || !target) return previous
        // The server has no clocks to run for daily puzzles.
        if (['tick', 'pause', 'resume'].includes(event.type)) return previous
        try {
          const reply = await sendRankedDaily<State>(target.puzzle, target.dateKey, event)
          if (!reply.changed) return previous
          const next = reply.view
          stateRef.current = next
          setState(next)
          const outcomes = rules.outcomesBetween(previous, next, LOCAL_PLAYER)
          if (outcomes.length > 0) callbacksRef.current.onOutcomes?.(outcomes)
          if (!rules.isFinished(previous) && rules.isFinished(next)) {
            callbacksRef.current.onFinish?.(rules.summarize(next, LOCAL_PLAYER))
          }
          return next
        } catch (error) {
          target.onError(
            error instanceof ApiError && error.status !== 0
              ? error.message
              : 'The connection to the server was lost. Your move was not saved.',
          )
          return previous
        }
      }
      const result = queue.current.then(run, run)
      queue.current = result
      return result
    },
    [rules],
  )

  return { state, send }
}
