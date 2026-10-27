import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import type { ServerMessage } from '../src/net/protocol'
import { DevMailer } from './auth/mail'
import { loadConfig, type ServerConfig } from './config'
import { loadServerGeo, startServer, type RunningServer } from './index'
import {
  MAX_CONNECTIONS_PER_IP,
  MAX_FAILED_JOINS_PER_MINUTE,
  MAX_ROOMS_PER_IP_PER_10_MIN,
} from './realtime'
import { clientIp, originAllowed } from './security'

const geo = loadServerGeo()
let server: RunningServer | null = null

async function boot(overrides: Partial<ServerConfig> = {}, env: Record<string, string> = {}) {
  server = await startServer({
    config: loadConfig(env, {
      port: 0,
      host: '127.0.0.1',
      databasePath: ':memory:',
      distDir: null,
      ...overrides,
    }),
    geo,
    mailer: new DevMailer(() => {}),
  })
  return server
}

afterEach(async () => {
  await server?.close()
  server = null
})

const base = () => `http://127.0.0.1:${server!.port}`

async function connect(headers: Record<string, string> = {}) {
  const socket = new WebSocket(`ws://127.0.0.1:${server!.port}/ws`, { headers })
  const messages: ServerMessage[] = []
  socket.on('message', (data) => messages.push(JSON.parse(data.toString())))
  socket.on('error', () => {})
  const closed = new Promise<number>((resolve) => socket.once('close', resolve))
  const outcome = await new Promise<'open' | { closed: number } | 'refused'>((resolve) => {
    socket.once('open', () => resolve('open'))
    socket.once('unexpected-response', () => resolve('refused'))
    socket.once('close', (code) => resolve({ closed: code }))
  })
  return { socket, messages, outcome, closed, send: (m: object) => socket.send(JSON.stringify(m)) }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('security headers', () => {
  it('put a content security policy and friends on every response', async () => {
    await boot({ publicOrigin: 'http://localhost:8788' })
    const response = await fetch(`${base()}/health`)
    const policy = response.headers.get('content-security-policy')!
    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain("script-src 'self'")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("connect-src 'self' ws://localhost:8788")
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(response.headers.get('permissions-policy')).toContain('camera=()')
    // No HSTS over plain http, and nothing about upgrading while developing.
    expect(response.headers.get('strict-transport-security')).toBeNull()
    expect(policy).not.toContain('upgrade-insecure-requests')
  })

  it('add HSTS and upgrades in production behind https', async () => {
    await boot(
      { publicOrigin: 'https://play.example.com' },
      { NODE_ENV: 'production', DAILY_SECRET: 'secret' },
    )
    const response = await fetch(`${base()}/health`)
    expect(response.headers.get('strict-transport-security')).toMatch(/max-age=31536000/)
    const policy = response.headers.get('content-security-policy')!
    expect(policy).toContain('wss://play.example.com')
    expect(policy).toContain('upgrade-insecure-requests')
  })

  it('do not ask a plain-http production site to upgrade itself', async () => {
    await boot(
      { publicOrigin: 'http://localhost:8788' },
      { NODE_ENV: 'production', DAILY_SECRET: 'secret' },
    )
    const policy = (await fetch(`${base()}/health`)).headers.get('content-security-policy')!
    expect(policy).not.toContain('upgrade-insecure-requests')
  })

  it('keep API answers out of shared caches', async () => {
    await boot()
    const response = await fetch(`${base()}/api/nothing`)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})

describe('origins', () => {
  const config = (overrides: Partial<ServerConfig> = {}, env: Record<string, string> = {}) =>
    loadConfig(env, { publicOrigin: 'https://play.example.com', ...overrides })

  it('allow this site, listed sites and requests without an origin', () => {
    const c = config(
      { allowedOrigins: ['https://www.example.com'] },
      { NODE_ENV: 'production', DAILY_SECRET: 'x' },
    )
    expect(originAllowed('https://play.example.com', c)).toBe(true)
    expect(originAllowed('https://www.example.com', c)).toBe(true)
    expect(originAllowed(undefined, c)).toBe(true)
    expect(originAllowed('https://evil.example', c)).toBe(false)
    expect(originAllowed('http://localhost:5173', c)).toBe(false)
    expect(originAllowed('null', c)).toBe(false)
  })

  it('also allow this machine while developing', () => {
    const c = config()
    expect(originAllowed('http://localhost:5174', c)).toBe(true)
    expect(originAllowed('http://127.0.0.1:5180', c)).toBe(true)
    expect(originAllowed('https://evil.example', c)).toBe(false)
  })

  it('refuse API writes from another site, but not reads or tool requests', async () => {
    await boot()
    const post = (origin?: string) =>
      fetch(`${base()}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
        body: '{}',
      })
    expect((await post('https://evil.example')).status).toBe(403)
    expect((await post('http://localhost:5174')).status).toBe(200)
    expect((await post()).status).toBe(200)
    const read = await fetch(`${base()}/api/nothing`, {
      headers: { origin: 'https://evil.example' },
    })
    expect(read.status).toBe(404)
  })

  it('refuse a socket opened by another site', async () => {
    await boot()
    expect((await connect({ origin: 'https://evil.example' })).outcome).toBe('refused')
    const fine = await connect({ origin: 'http://localhost:5174' })
    expect(fine.outcome).toBe('open')
    const none = await connect()
    expect(none.outcome).toBe('open')
    fine.socket.close()
    none.socket.close()
  })
})

describe('client addresses', () => {
  it('ignore forwarding headers unless a proxy is trusted', () => {
    const headers = { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }
    const untrusted = { trustProxy: false, clientIpHeader: null }
    const trusted = { trustProxy: true, clientIpHeader: null }
    expect(clientIp(headers, '10.0.0.1', untrusted)).toBe('10.0.0.1')
    expect(clientIp(headers, '10.0.0.1', trusted)).toBe('203.0.113.9')
    expect(clientIp({ 'cf-connecting-ip': '198.51.100.7', ...headers }, '10.0.0.1', trusted)).toBe(
      '198.51.100.7',
    )
    expect(clientIp({}, undefined, trusted)).toBe('unknown')
  })

  it('read only the named header behind a proxy that appends to X-Forwarded-For', () => {
    const fly = { trustProxy: true, clientIpHeader: 'fly-client-ip' }
    // The player wrote the first X-Forwarded-For entry and a CF-Connecting-IP of their own.
    const spoofed = {
      'x-forwarded-for': '1.2.3.4, 203.0.113.9',
      'cf-connecting-ip': '1.2.3.4',
      'fly-client-ip': '203.0.113.9',
    }
    expect(clientIp(spoofed, '172.16.0.2', fly)).toBe('203.0.113.9')
    expect(clientIp({ 'x-forwarded-for': '1.2.3.4' }, '172.16.0.2', fly)).toBe('172.16.0.2')
    expect(clientIp(spoofed, '172.16.0.2', { ...fly, trustProxy: false })).toBe('172.16.0.2')
  })
})

describe('abuse limits', () => {
  it('cap the connections one address may hold', async () => {
    await boot()
    const open = []
    for (let i = 0; i < MAX_CONNECTIONS_PER_IP; i++) open.push(await connect())
    expect(open.every((c) => c.outcome === 'open')).toBe(true)
    const extra = await connect()
    expect(await extra.closed).toBe(1013)
    // Closing one makes room again.
    open[0].socket.close()
    await open[0].closed
    await wait(50)
    const again = await connect()
    expect(again.outcome).toBe('open')
    for (const c of [...open, again]) c.socket.close()
  })

  it('cap how many rooms one address may start', async () => {
    await boot()
    const player = await connect()
    for (let i = 0; i < MAX_ROOMS_PER_IP_PER_10_MIN; i++) {
      player.send({ t: 'create', name: 'Ana', color: '#ff6b6b' })
      await wait(5)
    }
    await wait(300)
    expect(player.messages.filter((m) => m.t === 'welcome')).toHaveLength(
      MAX_ROOMS_PER_IP_PER_10_MIN,
    )
    player.send({ t: 'create', name: 'Ana', color: '#ff6b6b' })
    await wait(150)
    const last = player.messages.at(-1)
    expect(last).toMatchObject({
      t: 'error',
      message: expect.stringMatching(/rooms made recently/),
    })
    player.socket.close()
  })

  it('make room codes five letters, and never one of the app’s own addresses', async () => {
    await boot()
    const player = await connect()
    player.send({ t: 'create', name: 'Ana', color: '#ff6b6b' })
    await wait(100)
    const welcome = player.messages.find((m) => m.t === 'welcome')
    expect(welcome).toMatchObject({ code: expect.stringMatching(/^[A-HJ-NP-Z]{5}$/) })
    expect((welcome as { code: string }).code).not.toBe('QUICK')
    player.socket.close()
  })

  it('slow down people who try one wrong room code after another', async () => {
    await boot()
    const player = await connect()
    for (let i = 0; i < MAX_FAILED_JOINS_PER_MINUTE; i++) {
      player.send({ t: 'join', code: 'ZZZZZ', name: 'Ana', color: '#ff6b6b' })
      await wait(5)
    }
    await wait(200)
    expect(player.messages.filter((m) => m.t === 'error' && m.code === 'no-room')).toHaveLength(
      MAX_FAILED_JOINS_PER_MINUTE,
    )
    player.send({ t: 'join', code: 'ZZZZZ', name: 'Ana', color: '#ff6b6b' })
    await wait(150)
    expect(player.messages.at(-1)).toMatchObject({ message: expect.stringMatching(/wrong codes/) })
    player.socket.close()
  })

  it('answer a flood with one warning, not one per message', async () => {
    await boot()
    const player = await connect()
    for (let i = 0; i < 120; i++) player.send({ t: 'ping', sentAt: i })
    await wait(400)
    const warnings = player.messages.filter((m) => m.t === 'error' && m.message === 'Slow down.')
    expect(warnings.length).toBeGreaterThanOrEqual(1)
    expect(warnings.length).toBeLessThanOrEqual(2)
    player.socket.close()
  })

  it('cut off a connection that keeps flooding', async () => {
    await boot()
    const player = await connect()
    for (let i = 0; i < 400; i++) player.send({ t: 'ping', sentAt: i })
    expect(await player.closed).toBe(1008)
  })
})
