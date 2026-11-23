import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { loadConfig } from './config'
import { openDatabase } from './db'
import { loadServerGeo, startServer, type RunningServer } from './index'
import { USAGE_EVENTS_PER_IP_PER_MINUTE, UsageStore } from './usage'

const geo = loadServerGeo()
let server: RunningServer | null = null

afterEach(async () => {
  await server?.close()
  server = null
})

describe('usage store', () => {
  it('groups counts by today, last 7 UTC days, and total', () => {
    let clock = Date.parse('2026-11-23T12:00:00Z')
    const db = openDatabase(':memory:')
    const store = new UsageStore(db, () => clock)

    // 10 days ago (outside 7-day window, inside total).
    clock = Date.parse('2026-11-13T12:00:00Z')
    store.record('visit')
    store.record('mode:pinpoint')

    // 6 days ago (earliest day inside 7-day window).
    clock = Date.parse('2026-11-17T08:00:00Z')
    store.record('visit')
    store.record('finish:pinpoint')

    // Today.
    clock = Date.parse('2026-11-23T15:00:00Z')
    store.record('visit')
    store.record('visit')
    store.record('mode:learn')

    expect(store.summary()).toEqual({
      today: { 'mode:learn': 1, visit: 2 },
      last7Days: { 'finish:pinpoint': 1, 'mode:learn': 1, visit: 3 },
      total: { 'finish:pinpoint': 1, 'mode:learn': 1, 'mode:pinpoint': 1, visit: 4 },
    })
    db.close()
  })
})

describe('usage endpoint and /admin/counters', () => {
  it('accepts cookie-less counts, rejects unknown events, and reports totals in /admin/counters', async () => {
    server = await startServer({
      config: loadConfig(
        {},
        {
          port: 0,
          host: '127.0.0.1',
          databasePath: ':memory:',
          distDir: null,
          metricsToken: 'metrics-secret',
        },
      ),
      geo,
    })
    const base = `http://127.0.0.1:${server.port}`

    const ok = await fetch(`${base}/api/usage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'visit' }),
    })
    expect(ok.status).toBe(204)
    expect(ok.headers.getSetCookie()).toEqual([])

    const mode = await fetch(`${base}/api/usage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'finish:pinpoint' }),
    })
    expect(mode.status).toBe(204)

    const bad = await fetch(`${base}/api/usage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'not-a-real-event' }),
    })
    expect(bad.status).toBe(400)

    // Creating a room records room:created too.
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`)
    await new Promise((resolve) => socket.once('open', resolve))
    socket.send(JSON.stringify({ t: 'create', name: 'Ana', color: '#ff6b6b' }))
    await new Promise((resolve) => socket.once('message', resolve))
    socket.close()

    const counters = await (
      await fetch(`${base}/admin/counters`, { headers: { authorization: 'Bearer metrics-secret' } })
    ).json()
    expect(counters.usage).toEqual({
      today: { 'finish:pinpoint': 1, 'room:created': 1, visit: 1 },
      last7Days: { 'finish:pinpoint': 1, 'room:created': 1, visit: 1 },
      total: { 'finish:pinpoint': 1, 'room:created': 1, visit: 1 },
    })
  })

  it('rate limits /api/usage per address', async () => {
    server = await startServer({
      config: loadConfig(
        {},
        { port: 0, host: '127.0.0.1', databasePath: ':memory:', distDir: null },
      ),
      geo,
    })
    const base = `http://127.0.0.1:${server.port}`
    for (let i = 0; i < USAGE_EVENTS_PER_IP_PER_MINUTE; i++) {
      const r = await fetch(`${base}/api/usage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'visit' }),
      })
      expect(r.status).toBe(204)
    }
    const limited = await fetch(`${base}/api/usage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'visit' }),
    })
    expect(limited.status).toBe(429)
  })
})
