import type { Context, Hono } from 'hono'
import { getConnInfo } from '@hono/node-server/conninfo'
import { USAGE_EVENTS, type UsageEvent } from '../src/net/usage'
import type { AppContext } from './app'
import { RateLimiter } from './auth/rateLimit'
import { type Database } from './db'
import { clientIp } from './security'

export { USAGE_EVENTS, type UsageEvent }

const EVENT_SET = new Set<string>(USAGE_EVENTS)
const DAY_MS = 86_400_000
export const USAGE_EVENTS_PER_IP_PER_MINUTE = 120

export interface UsageSummary {
  today: Record<string, number>
  last7Days: Record<string, number>
  total: Record<string, number>
}

export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function isUsageEvent(value: unknown): value is UsageEvent {
  return typeof value === 'string' && EVENT_SET.has(value)
}

/** First-party, cookie-less daily usage totals stored as plain (day, event, count) rows. */
export class UsageStore {
  private readonly db: Database
  private readonly now: () => number

  constructor(db: Database, now: () => number = Date.now) {
    this.db = db
    this.now = now
  }

  record(event: UsageEvent) {
    const day = utcDay(this.now())
    this.db
      .prepare(
        `INSERT INTO usage_counts (day, event, count) VALUES (?, ?, 1)
         ON CONFLICT (day, event) DO UPDATE SET count = count + 1`,
      )
      .run(day, event)
  }

  summary(): UsageSummary {
    const now = this.now()
    const todayKey = utcDay(now)
    const weekStart = utcDay(now - 6 * DAY_MS)
    const map = (rows: { event: string; count: number }[]) =>
      Object.fromEntries(rows.map((r) => [r.event, Number(r.count)]))

    const today = map(
      this.db
        .prepare('SELECT event, count FROM usage_counts WHERE day = ? ORDER BY event')
        .all(todayKey) as { event: string; count: number }[],
    )
    const last7Days = map(
      this.db
        .prepare(
          'SELECT event, SUM(count) AS count FROM usage_counts WHERE day >= ? AND day <= ? GROUP BY event ORDER BY event',
        )
        .all(weekStart, todayKey) as { event: string; count: number }[],
    )
    const total = map(
      this.db
        .prepare(
          'SELECT event, SUM(count) AS count FROM usage_counts GROUP BY event ORDER BY event',
        )
        .all() as { event: string; count: number }[],
    )
    return { today, last7Days, total }
  }
}

export function usageRoutes(api: Hono, { config, now }: AppContext, store: UsageStore) {
  const perIp = new RateLimiter(USAGE_EVENTS_PER_IP_PER_MINUTE, 60_000, now)
  const ipOf = (c: Context) => clientIp(c.req.header(), getConnInfo(c).remote.address, config)

  api.post('/usage', async (c) => {
    if (!perIp.take(ipOf(c))) return c.json({ error: 'Too many requests.' }, 429)
    let event: unknown
    try {
      const body: unknown = await c.req.json()
      if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
        event = (body as { event?: unknown }).event
      }
    } catch {
      return c.json({ error: 'Send JSON.' }, 400)
    }
    if (!isUsageEvent(event)) return c.json({ error: 'Unknown event.' }, 400)
    store.record(event)
    return c.body(null, 204)
  })
}
