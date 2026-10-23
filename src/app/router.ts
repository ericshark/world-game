import { useCallback, useEffect, useState } from 'react'
import type { DailyPuzzle } from '../game/core/types'

export type ModeKey = 'pinpoint' | 'rush' | 'rare-earth' | 'mystery' | 'journey' | 'battle'

export type Route =
  | { name: 'home' }
  | { name: 'setup'; mode: ModeKey }
  | { name: 'play'; mode: ModeKey }
  | { name: 'passport' }
  | { name: 'daily' }
  | { name: 'challenge'; token: string }
  | { name: 'online' }
  | { name: 'room'; code: string }
  | { name: 'daily-play'; puzzle: DailyPuzzle }
  | { name: 'settings' }

export const MODE_KEYS: readonly ModeKey[] = [
  'pinpoint',
  'rush',
  'rare-earth',
  'mystery',
  'journey',
  'battle',
]
const DAILY_PUZZLES: readonly DailyPuzzle[] = ['five', 'mystery', 'route']

/** Routes live in the URL hash, so the back button works and links can open a screen. */
export function parseRoute(hash: string): Route {
  const [first, second] = hash.replace(/^#\/?/, '').split('/')
  const mode = MODE_KEYS.find((key) => key === second)
  if ((first === 'setup' || first === 'play') && mode) return { name: first, mode }
  if (first === 'challenge' && second) return { name: 'challenge', token: second }
  if (first === 'online') return { name: 'online' }
  if (first === 'room' && /^[A-Za-z]{3,4}$/.test(second ?? '')) {
    return { name: 'room', code: second.toUpperCase() }
  }
  if (first === 'daily') {
    const puzzle = DAILY_PUZZLES.find((p) => p === second)
    return puzzle ? { name: 'daily-play', puzzle } : { name: 'daily' }
  }
  // "stats" was the Passport's old name.
  if (first === 'passport' || first === 'stats') return { name: 'passport' }
  if (first === 'settings') return { name: first }
  return { name: 'home' }
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/'
    case 'setup':
    case 'play':
      return `#/${route.name}/${route.mode}`
    case 'daily-play':
      return `#/daily/${route.puzzle}`
    case 'challenge':
      return `#/challenge/${route.token}`
    case 'room':
      return `#/room/${route.code}`
    default:
      return `#/${route.name}`
  }
}

export function useRoute(): [Route, (route: Route, options?: { replace?: boolean }) => void] {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((next: Route, { replace = false } = {}) => {
    const hash = routeHash(next)
    if (replace) window.history.replaceState(null, '', hash)
    else if (window.location.hash !== hash) window.history.pushState(null, '', hash)
    setRoute(next)
  }, [])

  return [route, navigate]
}
