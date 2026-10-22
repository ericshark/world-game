import { useCallback, useEffect, useRef, useState } from 'react'
import type { GeoData } from '../geo/facts'
import type { ModeRules, SessionEvent } from '../game/core/mode'
import { randomSeed } from '../game/core/random'
import { LOCAL_PLAYER, type CountryOutcome, type SessionSummary } from '../game/core/types'
import type { StatsByCountry } from '../game/profile/stats'

interface SessionCallbacks {
  /** Countries revealed during play, recorded as they happen. */
  onOutcomes?: (outcomes: CountryOutcome[]) => void
  onFinish?: (summary: SessionSummary) => void
}

export interface LocalSession<Config, State, Event> {
  state: State | null
  start(config: Config, options?: StartOptions): State
  send(event: Event): State | null
  end(): void
}

interface StartOptions {
  seed?: string
  stats?: StatsByCountry
}

/**
 * Hosts a game in this browser: runs the mode's rules for the local player, feeds them the clock
 * (events and timer ticks) and reports outcomes. A server will host multiplayer games the same way.
 */
export function useLocalSession<Config, State, Event extends { type: string } = SessionEvent>(
  rules: ModeRules<Config, State, Event>,
  geo: GeoData | null,
  callbacks: SessionCallbacks,
  /** Starts a game straight away with this setup. */
  initial?: { config: Config } & StartOptions,
): LocalSession<Config, State, Event> {
  const [state, setState] = useState<State | null>(() =>
    initial && geo ? startGame(rules, geo, initial.config, initial) : null,
  )
  const stateRef = useRef<State | null>(state)
  const callbacksRef = useRef(callbacks)
  useEffect(() => {
    callbacksRef.current = callbacks
  })

  const commit = useCallback((next: State | null) => {
    stateRef.current = next
    setState(next)
  }, [])

  const start = useCallback(
    (config: Config, options: StartOptions = {}) => {
      if (!geo) throw new Error('Geography is not loaded yet')
      const started = startGame(rules, geo, config, options)
      commit(started)
      return started
    },
    [rules, geo, commit],
  )

  const send = useCallback(
    (event: Event) => {
      const previous = stateRef.current
      if (!previous || !geo) return previous
      const next = rules.reduce(previous, event, geo)
      if (next === previous) return previous
      commit(next)

      const outcomes = rules.outcomesBetween(previous, next, LOCAL_PLAYER)
      if (outcomes.length > 0) callbacksRef.current.onOutcomes?.(outcomes)
      if (!rules.isFinished(previous) && rules.isFinished(next)) {
        callbacksRef.current.onFinish?.(rules.summarize(next, LOCAL_PLAYER))
      }
      return next
    },
    [rules, geo, commit],
  )

  const end = useCallback(() => commit(null), [commit])

  // Timers live in the rules as deadlines; wake up when the next one is due.
  const deadline = state ? rules.deadline(state) : null
  useEffect(() => {
    if (deadline === null) return
    const timeout = window.setTimeout(
      // Every mode's events include SessionEvent's tick.
      () => send({ type: 'tick', at: Date.now() } as SessionEvent as unknown as Event),
      Math.max(0, deadline - Date.now()),
    )
    return () => window.clearTimeout(timeout)
  }, [deadline, send])

  return { state, start, send, end }
}

function startGame<Config, State, Event>(
  rules: ModeRules<Config, State, Event>,
  geo: GeoData,
  config: Config,
  { seed = randomSeed(), stats }: StartOptions,
): State {
  return rules.start({ config, seed, now: Date.now(), geo, players: [LOCAL_PLAYER], stats })
}
