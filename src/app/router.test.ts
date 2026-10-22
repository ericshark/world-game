import { describe, expect, it } from 'vitest'
import { parseRoute, routeHash, type Route } from './router'

describe('router', () => {
  it.each<[string, Route]>([
    ['', { name: 'home' }],
    ['#/', { name: 'home' }],
    ['#/setup/pinpoint', { name: 'setup', mode: 'pinpoint' }],
    ['#/play/pinpoint', { name: 'play', mode: 'pinpoint' }],
    ['#/passport', { name: 'passport' }],
    ['#/stats', { name: 'passport' }],
    ['#/settings', { name: 'settings' }],
    ['#/play/unknown', { name: 'home' }],
    ['#/nonsense', { name: 'home' }],
  ])('parses %s', (hash, route) => {
    expect(parseRoute(hash)).toEqual(route)
  })

  it('round-trips', () => {
    for (const route of [
      { name: 'home' },
      { name: 'play', mode: 'pinpoint' },
      { name: 'settings' },
    ] as Route[]) {
      expect(parseRoute(routeHash(route))).toEqual(route)
    }
  })
})
