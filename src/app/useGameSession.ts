import type { CityIndex } from '../geo/cities'
import type { GeoData } from '../geo/facts'
import type { SubPackId, SubdivisionPack } from '../geo/subdivisions'
import type { ModeRules, SessionEvent } from '../game/core/mode'
import type { CountryOutcome, SessionSummary } from '../game/core/types'
import type { StatsByCountry } from '../game/profile/stats'
import { useCallback } from 'react'
import { useLocalSession } from './useLocalSession'
import { useRemoteSession, type RemoteDaily } from './useRemoteSession'

interface Callbacks {
  onOutcomes?: (outcomes: CountryOutcome[]) => void
  onFinish?: (summary: SessionSummary) => void
}

/** A game hosted here, or by the server for a ranked daily. Await `send` to see the result. */
export interface GameSession<Config, State, Event> {
  state: State | null
  /** Starts another game; ranked dailies are played once, so this only works locally. */
  start(
    config: Config,
    options?: {
      seed?: string
      stats?: StatsByCountry
      cities?: CityIndex
      subdivisions?: Partial<Record<SubPackId, SubdivisionPack>>
    },
  ): State
  send(event: Event): Promise<State | null>
  end(): void
}

/**
 * One hook for the games a daily can be: the browser hosts them as usual, or, with `remote`,
 * the server does. Both are always set up so hooks run in the same order; only one is used.
 */
export function useGameSession<Config, State, Event extends { type: string } = SessionEvent>(
  rules: ModeRules<Config, State, Event>,
  geo: GeoData | null,
  callbacks: Callbacks,
  initial: {
    config: Config
    seed?: string
    stats?: StatsByCountry
    cities?: CityIndex
    subdivisions?: Partial<Record<SubPackId, SubdivisionPack>>
    /** Carries on with a game saved earlier instead of starting a new one. */
    resume?: State | null
  },
  remote?: RemoteDaily,
): GameSession<Config, State, Event> {
  const local = useLocalSession(rules, geo, callbacks, remote ? undefined : initial)
  const hosted = useRemoteSession(rules, geo, callbacks, remote)
  const { send: sendLocal } = local
  const sendHere = useCallback((event: Event) => Promise.resolve(sendLocal(event)), [sendLocal])
  if (remote) {
    return {
      state: hosted.state,
      send: hosted.send,
      start: () => {
        throw new Error('A ranked daily is played once')
      },
      end: () => {},
    }
  }
  return {
    state: local.state,
    start: local.start,
    send: sendHere,
    end: local.end,
  }
}
