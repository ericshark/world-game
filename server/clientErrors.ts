import type { Context, Hono } from 'hono'
import { getConnInfo } from '@hono/node-server/conninfo'
import type { AppContext } from './app'
import { RateLimiter } from './auth/rateLimit'
import { log } from './log'
import { clientIp } from './security'

/** Reports one address may send an hour: enough for a crash loop to show, not to flood the log. */
export const CLIENT_ERRORS_PER_IP_PER_HOUR = 20

/** Clips a reported field to a string of at most `max` characters. */
function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

/**
 * Crash reports from the browser, so the error id a player quotes from the crash page can be
 * found in the server log. Only the id, message, a short stack and the in-game route are kept.
 */
export function clientErrorRoutes(api: Hono, { config, now }: AppContext) {
  const perIp = new RateLimiter(CLIENT_ERRORS_PER_IP_PER_HOUR, 60 * 60_000, now)
  const ipOf = (c: Context) => clientIp(c.req.header(), getConnInfo(c).remote.address, config)

  api.post('/client-error', async (c) => {
    if (!perIp.take(ipOf(c))) return c.json({ error: 'Too many reports.' }, 429)
    let report: Record<string, unknown> = {}
    try {
      const data: unknown = await c.req.json()
      if (typeof data === 'object' && data !== null) report = data as Record<string, unknown>
    } catch {
      return c.json({ error: 'Send JSON.' }, 400)
    }
    log('error', 'client_error', {
      id: clip(report.id, 8),
      message: clip(report.message, 300),
      stack: clip(report.stack, 1500).split('\n').slice(0, 6).join('\n'),
      // Only the screen's name: the rest of the route can hold a sign-in token or a room code.
      screen: clip(report.route, 100)
        .replace(/^#?\/?/, '')
        .split(/[/?]/)[0]
        .replace(/[^\w-]/g, '')
        .slice(0, 30),
    })
    return c.body(null, 204)
  })
}
