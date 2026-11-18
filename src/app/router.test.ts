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
    ['#/learn', { name: 'learn' }],
    ['#/atlas', { name: 'atlas' }],
    ['#/learn/review', { name: 'learn-play', target: 'review' }],
    ['#/learn/western-europe-2', { name: 'learn-play', target: 'western-europe-2' }],
    ['#/learn/BAD%20ID', { name: 'learn' }],
    ['#/daily', { name: 'daily' }],
    ['#/daily/mystery', { name: 'daily-play', puzzle: 'mystery' }],
    ['#/daily/nope', { name: 'daily' }],
    ['#/challenge/abc_-1', { name: 'challenge', token: 'abc_-1' }],
    ['#/online', { name: 'online' }],
    ['#/room/abcd', { name: 'room', code: 'ABCD' }],
    ['#/room/new', { name: 'room', code: 'NEW' }],
    ['#/room/quick', { name: 'room', code: 'QUICK' }],
    ['#/privacy', { name: 'privacy' }],
    ['#/credits', { name: 'credits' }],
    ['#/leaderboards', { name: 'leaderboards' }],
    ['#/signin/tok_en-1', { name: 'signin', token: 'tok_en-1' }],
    ['#/settings?signin=ok', { name: 'settings' }],
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
      { name: 'learn' },
      { name: 'learn-play', target: 'review' },
    ] as Route[]) {
      expect(parseRoute(routeHash(route))).toEqual(route)
    }
  })
})
