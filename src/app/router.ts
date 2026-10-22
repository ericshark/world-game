import { useCallback, useEffect, useState } from 'react'

export type ModeKey = 'pinpoint' | 'rush' | 'rare-earth' | 'mystery' | 'journey'

export type Route =
  | { name: 'home' }
  | { name: 'setup'; mode: ModeKey }
  | { name: 'play'; mode: ModeKey }
  | { name: 'stats' }
  | { name: 'settings' }

const MODE_KEYS: readonly ModeKey[] = ['pinpoint', 'rush', 'rare-earth', 'mystery', 'journey']

/** Routes live in the URL hash, so the back button works and links can open a screen. */
export function parseRoute(hash: string): Route {
  const [first, second] = hash.replace(/^#\/?/, '').split('/')
  const mode = MODE_KEYS.find((key) => key === second)
  if ((first === 'setup' || first === 'play') && mode) return { name: first, mode }
  if (first === 'stats' || first === 'settings') return { name: first }
  return { name: 'home' }
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/'
    case 'setup':
    case 'play':
      return `#/${route.name}/${route.mode}`
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
