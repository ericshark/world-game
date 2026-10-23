import { createContext, useContext } from 'react'
import { MODE_KEYS, routeHash, type ModeKey } from './router'

/**
 * A shareable challenge: the same mode, setup and seed, so a friend plays the identical game,
 * plus the score to beat. Lives entirely in the link; no server needed.
 */
export interface ChallengeLink {
  mode: ModeKey
  seed: string
  config: unknown
  score: number
}

/** Comfortably above any real score; anything larger came from an edited link. */
const MAX_SCORE = 1_000_000

export function encodeChallenge(link: ChallengeLink): string {
  const json = JSON.stringify({ m: link.mode, s: link.seed, c: link.config, p: link.score })
  const bytes = new TextEncoder().encode(json)
  // Byte by byte: spreading a long array into fromCharCode can overflow the call stack.
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The challenge in a link, or null if it is damaged. The config still needs sanitising. */
export function decodeChallenge(token: string): ChallengeLink | null {
  try {
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const data = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
    const mode = MODE_KEYS.find((key) => key === data.m)
    const score = data.p
    if (!mode || typeof data.s !== 'string' || typeof score !== 'number') return null
    if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) return null
    return { mode, seed: data.s, config: data.c ?? {}, score: Math.round(score) }
  } catch {
    return null
  }
}

export function challengeUrl(link: ChallengeLink): string {
  const base = `${window.location.origin}${window.location.pathname}`
  return `${base}${routeHash({ name: 'challenge', token: encodeChallenge(link) })}`
}

/** Tells a game which mode and setup it is, and whose score it is up against, if anyone's. */
export interface GameContextValue {
  mode: ModeKey
  config: unknown
  rival: number | null
}

export const GameContext = createContext<GameContextValue | null>(null)

/** What the results screen needs to offer a rematch link and compare with a rival. */
export function useChallenge(seed: string | undefined, score: number) {
  const game = useContext(GameContext)
  if (!game || !seed) return undefined
  return {
    link: challengeUrl({ mode: game.mode, seed, config: game.config, score }),
    rival: game.rival,
  }
}
