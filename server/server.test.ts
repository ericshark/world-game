import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import type { RoomView, ServerMessage } from '../src/net/protocol'
import { loadConfig } from './config'
import { loadServerGeo, startServer, type RunningServer } from './index'

const geo = loadServerGeo()
let server: RunningServer

beforeAll(async () => {
  server = await startServer({
    config: loadConfig({}, { port: 0, host: '127.0.0.1', databasePath: ':memory:', distDir: null }),
    geo,
  })
})
afterAll(() => server.close())

/** A test client that records every message and can wait for one. */
async function connect() {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`)
  const messages: ServerMessage[] = []
  const waiters: (() => void)[] = []
  socket.on('message', (data) => {
    messages.push(JSON.parse(data.toString()))
    for (const wake of waiters.splice(0)) wake()
  })
  await new Promise((resolve) => socket.once('open', resolve))
  const client = {
    socket,
    messages,
    send: (message: object) => socket.send(JSON.stringify(message)),
    async waitFor<T extends ServerMessage>(
      test: (m: ServerMessage) => m is T,
      after = 0,
    ): Promise<T> {
      for (;;) {
        const found = messages.slice(after).find(test)
        if (found) return found
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('timed out waiting for a message')),
            5000,
          )
          waiters.push(() => {
            clearTimeout(timeout)
            resolve()
          })
        })
      }
    },
    /** The latest room view matching a condition. */
    async room(test: (room: RoomView) => boolean, after = 0) {
      const message = await client.waitFor(
        (m): m is Extract<ServerMessage, { t: 'room' }> => m.t === 'room' && test(m.room),
        after,
      )
      return message.room
    },
  }
  return client
}

const isWelcome = (m: ServerMessage): m is Extract<ServerMessage, { t: 'welcome' }> =>
  m.t === 'welcome'
const isError = (m: ServerMessage): m is Extract<ServerMessage, { t: 'error' }> => m.t === 'error'

describe('battle server', () => {
  it('runs a private room from lobby to revealed rounds, with reconnection', async () => {
    const ana = await connect()
    ana.send({ t: 'create', name: 'Ana', color: '#ff6b6b' })
    const { code, playerId: anaId } = await ana.waitFor(isWelcome)
    expect(code).toMatch(/^[A-Z]{5}$/)

    const ben = await connect()
    ben.send({ t: 'join', code: code.toLowerCase(), name: 'Ben', color: '#ff6b6b' })
    const { playerId: benId, token: benToken } = await ben.waitFor(isWelcome)
    const lobby = await ana.room((room) => room.members.length === 2)
    expect(lobby.hostId).toBe(anaId)
    // Same colour requested: the second player gets another one.
    expect(lobby.members[1].color).not.toBe(lobby.members[0].color)

    // Only the host configures and starts, and only once everyone is ready.
    ben.send({ t: 'start' })
    ana.send({
      t: 'configure',
      settings: { format: 'party', content: 'pinpoint', bots: 0, botSkill: 'novice' },
    })
    const beforeReady = ana.messages.length
    ana.send({ t: 'start' })
    expect((await ana.waitFor(isError, beforeReady)).message).toMatch(/Waiting for Ben/)
    ben.send({ t: 'set-ready', ready: true })
    await ana.room((room) => room.members.every((m) => m.ready))
    ana.send({ t: 'start' })
    const playing = await ben.room((room) => room.phase === 'playing')
    const challenge = playing.battle!.rounds.challenges[0]
    if (challenge.kind !== 'locate') throw new Error('expected a locate round')

    // Ana answers; Ben must not see her pin before the reveal.
    const mark = ben.messages.length
    ana.send({ t: 'submit', round: 0, pin: geo.factsOf(challenge.countryId).label })
    const afterAna = await ben.room(
      (room) => (room.battle?.rounds.deadline ?? Infinity) < playing.battle!.rounds.deadline!,
      mark,
    )
    expect(afterAna.battle!.rounds.submissions[0]).toEqual({ [anaId]: { at: expect.any(Number) } })
    expect(afterAna.battle!.seed).toBe('')

    ben.send({ t: 'submit', round: 0, pin: [-150, -40] })
    const revealed = await ana.room((room) => room.battle?.rounds.phase === 'revealed')
    expect(revealed.battle!.rounds.results[0][anaId].points).toBe(1000)
    expect(revealed.battle!.rounds.results[0][benId].kind).toBe('locate')

    ana.send({ t: 'ready' })
    ben.send({ t: 'ready' })
    await ana.room((room) => room.battle?.rounds.round === 1)

    // A newcomer cannot join mid-game.
    const carl = await connect()
    carl.send({ t: 'join', code, name: 'Carl', color: '#5ad1ff' })
    expect((await carl.waitFor(isError)).message).toMatch(/already started/)

    // Ben drops out and comes back as himself.
    ben.socket.close()
    await ana.room((room) => room.members.find((m) => m.id === benId)?.connected === false)
    const benAgain = await connect()
    benAgain.send({ t: 'join', code, name: 'Ben', color: '#5ad1ff', token: benToken })
    expect((await benAgain.waitFor(isWelcome)).playerId).toBe(benId)
    await ana.room((room) => room.members.find((m) => m.id === benId)?.connected === true)

    for (const client of [ana, benAgain, carl]) client.socket.close()
  })

  it('refuses bad messages and impossible games', async () => {
    const solo = await connect()
    solo.socket.send('{nonsense')
    expect((await solo.waitFor(isError)).message).toBe('Unrecognised message.')
    solo.send({ t: 'join', code: 'ZZZZ', name: 'Solo', color: '#ff6b6b' })
    expect((await solo.waitFor(isError, 1)).message).toBe('No room with that code.')

    solo.send({ t: 'create', name: 'Solo', color: '#ff6b6b' })
    await solo.waitFor(isWelcome)
    const mark = solo.messages.length
    solo.send({ t: 'start' })
    expect((await solo.waitFor(isError, mark)).message).toMatch(/at least two players/)

    // With bots, one person can play.
    solo.send({
      t: 'configure',
      settings: { format: 'duel', content: 'mixed', bots: 1, botSkill: 'novice' },
    })
    solo.send({ t: 'start' })
    const room = await solo.room((r) => r.phase === 'playing')
    expect(room.battle!.config.roster.map((p) => p.name)).toEqual(['Solo', 'Magellan'])
    solo.socket.close()
  })
})

describe('http', () => {
  it('reports readiness, and keeps its counters closed without a token', async () => {
    const base = `http://127.0.0.1:${server.port}`
    expect(await (await fetch(`${base}/health/ready`)).json()).toEqual({ status: 'ready' })
    expect((await fetch(`${base}/admin/counters`)).status).toBe(404)
    expect(
      (await fetch(`${base}/admin/counters`, { headers: { authorization: 'Bearer guess' } }))
        .status,
    ).toBe(404)
  })

  it('shows its counters to the holder of the token', async () => {
    const guarded = await startServer({
      config: loadConfig(
        {},
        {
          port: 0,
          host: '127.0.0.1',
          databasePath: ':memory:',
          distDir: null,
          metricsToken: 'sesame',
        },
      ),
      geo,
    })
    try {
      const base = `http://127.0.0.1:${guarded.port}`
      expect(
        (await fetch(`${base}/admin/counters`, { headers: { authorization: 'Bearer nope!' } }))
          .status,
      ).toBe(404)
      // Must require an explicit Bearer prefix and handle multi-byte UTF-8 safely.
      expect(
        (await fetch(`${base}/admin/counters`, { headers: { authorization: 'sesame' } })).status,
      ).toBe(404)
      expect(
        (
          await fetch(`${base}/admin/counters`, {
            headers: { authorization: `Bearer ${encodeURIComponent('ä'.repeat(6))}` },
          })
        ).status,
      ).toBe(404)
      const { tokensEqual } = await import('./auth/tokens')
      expect(tokensEqual('sesame', 'ä'.repeat(6))).toBe(false)
      expect(tokensEqual('sesame', 'sesame')).toBe(true)

      const res = await fetch(`${base}/admin/counters`, {
        headers: { authorization: 'Bearer sesame' },
      })
      expect(res.headers.get('cache-control')).toBe('no-store')
      const counters = await res.json()
      expect(counters).toMatchObject({ rooms: 0, sockets: 0, queued: 0, players: 0, matches: 0 })
      expect(counters.memoryMB).toBeGreaterThan(0)
    } finally {
      await guarded.close()
    }
  })

  it('answers the health check and unknown API paths', async () => {
    const base = `http://127.0.0.1:${server.port}`
    expect(await (await fetch(`${base}/health`)).text()).toMatch(/^ok \d+ rooms$/)
    const missing = await fetch(`${base}/api/nothing`)
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'Not found.' })
  })

  it('sends pre-compressed files and long cache lifetimes for versioned ones', async () => {
    const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { brotliCompressSync } = await import('node:zlib')
    const dist = mkdtempSync(join(tmpdir(), 'wg-dist-'))
    mkdirSync(join(dist, 'data'))
    mkdirSync(join(dist, 'textures'))
    writeFileSync(join(dist, 'index.html'), '<title>World Game</title>')
    const json = JSON.stringify({ countries: 'x'.repeat(5000) })
    writeFileSync(join(dist, 'data', 'countries.json'), json)
    writeFileSync(join(dist, 'data', 'countries.json.br'), brotliCompressSync(Buffer.from(json)))
    writeFileSync(join(dist, 'textures', 'earth.webp'), 'pretend image')
    const site = await startServer({
      config: loadConfig(
        {},
        { port: 0, host: '127.0.0.1', databasePath: ':memory:', distDir: dist },
      ),
      geo,
    })
    try {
      const base = `http://127.0.0.1:${site.port}`
      const packed = await fetch(`${base}/data/countries.json?v=abc`, {
        headers: { 'accept-encoding': 'br' },
      })
      expect(packed.headers.get('content-encoding')).toBe('br')
      expect(packed.headers.get('content-type')).toMatch(/json/)
      expect(packed.headers.get('cache-control')).toMatch(/immutable/)
      expect(await packed.text()).toBe(json)

      // Without brotli support the plain file is served.
      const plain = await fetch(`${base}/data/countries.json`, {
        headers: { 'accept-encoding': 'identity' },
      })
      expect(plain.headers.get('content-encoding')).toBeNull()
      expect(plain.headers.get('cache-control')).toBe('public, max-age=3600')
      expect(await plain.text()).toBe(json)

      expect(
        (await fetch(`${base}/textures/earth.webp?v=abc`)).headers.get('cache-control'),
      ).toMatch(/immutable/)
      // A path that climbs out of the site folder gets the page, never another file.
      const climb = await fetch(`${base}/..%2f..%2fetc%2fpasswd`, {
        headers: { 'accept-encoding': 'br' },
      })
      expect(await climb.text()).not.toMatch(/root:/)

      // Malformed URI sequences do not crash precompressed middleware with 500.
      const malformed = await fetch(`${base}/%E0%A4%A.js`, {
        headers: { 'accept-encoding': 'br' },
      })
      expect(malformed.status).toBe(404)
    } finally {
      await site.close()
      rmSync(dist, { recursive: true, force: true })
    }
  })

  it('serves the built site from the same port, with a single-page fallback', async () => {
    const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dist = mkdtempSync(join(tmpdir(), 'wg-dist-'))
    mkdirSync(join(dist, 'assets'))
    writeFileSync(
      join(dist, 'index.html'),
      '<title>World Game</title><meta property="og:url" content="%PUBLIC_ORIGIN%/" />',
    )
    writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'console.log(1)')
    writeFileSync(join(dist, 'sw.js'), 'self.addEventListener("fetch", () => {})')
    const site = await startServer({
      config: loadConfig(
        {},
        {
          port: 0,
          host: '127.0.0.1',
          databasePath: ':memory:',
          distDir: dist,
          publicOrigin: 'https://play.example.com',
        },
      ),
      geo,
    })
    try {
      const base = `http://127.0.0.1:${site.port}`
      const home = await fetch(base)
      const html = await home.text()
      expect(html).toContain('World Game')
      // The sharing tags carry this site's own address.
      expect(html).toContain('content="https://play.example.com/"')
      expect(html).not.toContain('%PUBLIC_ORIGIN%')
      expect(home.headers.get('cache-control')).toBe('no-cache')
      const script = await fetch(`${base}/assets/app-abc123.js`)
      expect(script.headers.get('cache-control')).toMatch(/immutable/)
      expect(await (await fetch(`${base}/some/deep/link`)).text()).toContain('World Game')
      expect((await fetch(`${base}/api/nothing`)).status).toBe(404)
      const sw = await fetch(`${base}/sw.js`)
      expect(sw.status).toBe(200)
      expect(sw.headers.get('cache-control')).toBe('no-cache')
      expect(sw.headers.get('content-type')).toMatch(/javascript/)
      // A file that does not exist is not a screen of the app.
      expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404)
    } finally {
      await site.close()
      rmSync(dist, { recursive: true, force: true })
    }
  })
})
