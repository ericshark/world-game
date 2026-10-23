import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { emptyProfile } from '../src/game/profile/profile'
import { loadConfig } from './config'
import { loadServerGeo, startServer, type RunningServer } from './index'
import { DevMailer } from './auth/mail'
import type { OAuthIdentity, OAuthProvider } from './auth/oauth'

const geo = loadServerGeo()
let server: RunningServer
let dir: string
let clock: number
let identity: OAuthIdentity

/** A provider that skips the network: the "code" it is given picks who signed in. */
const mockGoogle: OAuthProvider = {
  id: 'google',
  authorizationUrl: (state) => new URL(`https://accounts.example/auth?state=${state}`),
  async identify(code) {
    if (code === 'bad') throw new Error('refused')
    return identity
  },
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wg-auth-'))
  clock = 1_000_000
  identity = { subject: 'g-1', email: 'ana@example.com', emailVerified: true }
  server = await startServer({
    config: loadConfig(
      {},
      {
        port: 0,
        host: '127.0.0.1',
        databasePath: join(dir, 'test.sqlite'),
        distDir: null,
        publicOrigin: 'http://play.test',
      },
    ),
    geo,
    now: () => clock,
    mailer: new DevMailer(() => {}),
    oauth: new Map([['google', mockGoogle]]),
  })
})

afterEach(async () => {
  await server.close()
  rmSync(dir, { recursive: true, force: true })
})

/** A browser: keeps cookies between requests. */
function browser() {
  const cookies = new Map<string, string>()
  const request = async (path: string, init: { method?: string; body?: unknown } = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.port}${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: {
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      redirect: 'manual',
    })
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(';')
      const [name, ...value] = pair.split('=')
      if (/max-age=0/i.test(line) || value.join('=') === '') cookies.delete(name)
      else cookies.set(name, value.join('='))
    }
    const text = await response.text()
    let json: any = null
    try {
      json = JSON.parse(text)
    } catch {
      // Redirects have no body.
    }
    return { status: response.status, json, response }
  }
  return { cookies, request }
}

type Browser = ReturnType<typeof browser>

async function mailLinkToken(person: Browser) {
  const { json } = await person.request('/api/dev/mailbox')
  const text = json.at(-1).text as string
  return text.match(/#\/signin\/([\w-]+)/)![1]
}

async function signInByEmail(person: Browser, email: string) {
  expect((await person.request('/api/auth/magic', { body: { email } })).status).toBe(202)
  return person.request('/api/auth/magic/verify', { body: { token: await mailLinkToken(person) } })
}

describe('anonymous players', () => {
  it('start a session with an httpOnly cookie and store only its hash', async () => {
    const ana = browser()
    const first = await ana.request('/api/session', { body: {} })
    expect(first.status).toBe(200)
    expect(first.json.account).toBeNull()
    expect(first.json.player.nickname).toBeNull()
    const header = first.response.headers.getSetCookie()[0]
    expect(header).toMatch(/HttpOnly/i)
    expect(header).toMatch(/SameSite=Lax/i)

    // Coming back with the cookie is the same player.
    expect((await ana.request('/api/session', { body: {} })).json.player.id).toBe(
      first.json.player.id,
    )
    const db = new DatabaseSync(join(dir, 'test.sqlite'), { readOnly: true })
    const rows = db.prepare('SELECT token_hash FROM sessions').all()
    db.close()
    expect(rows).toHaveLength(1)
    expect(rows[0].token_hash).not.toBe(ana.cookies.get('wg_session'))
  })

  it('refuse writes that are not JSON', async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    })
    expect(response.status).toBe(415)
  })

  it('sessions expire', async () => {
    const ana = browser()
    const first = await ana.request('/api/session', { body: {} })
    clock += 181 * 24 * 3_600_000
    const later = await ana.request('/api/session', { body: {} })
    expect(later.json.player.id).not.toBe(first.json.player.id)
  })
})

describe('nicknames', () => {
  it('are cleaned, checked and made unique', async () => {
    const ana = browser()
    await ana.request('/api/session', { body: {} })
    const set = (nickname: unknown) =>
      ana.request('/api/nickname', { method: 'PUT', body: { nickname } })

    expect((await set('A')).status).toBe(400)
    expect((await set('x'.repeat(21))).status).toBe(400)
    expect((await set('Bad#1234')).status).toBe(400)
    expect((await set('fuck')).status).toBe(400)
    expect((await set(42)).status).toBe(400)
    expect((await set('  Ana‮ \u0000 Bell  ')).json.player.nickname).toBe('Ana Bell')

    // Another player wanting the same name (in any case) gets a number.
    const ben = browser()
    await ben.request('/api/session', { body: {} })
    const copy = await ben.request('/api/nickname', {
      method: 'PUT',
      body: { nickname: 'ana bell' },
    })
    expect(copy.json.player.nickname).toMatch(/^ana bell#\d{4}$/)
    // Asking again keeps the number already given.
    const again = await ben.request('/api/nickname', {
      method: 'PUT',
      body: { nickname: 'ana bell' },
    })
    expect(again.json.player.nickname).toBe(copy.json.player.nickname)
  })

  it('need a session first', async () => {
    const stranger = browser()
    const response = await stranger.request('/api/nickname', {
      method: 'PUT',
      body: { nickname: 'Ana' },
    })
    expect(response.status).toBe(401)
  })
})

describe('magic links', () => {
  it('sign in once, and the second use fails', async () => {
    const ana = browser()
    await ana.request('/api/session', { body: {} })
    await ana.request('/api/nickname', { method: 'PUT', body: { nickname: 'Ana' } })
    const verified = await signInByEmail(ana, 'Ana@Example.com')
    expect(verified.status).toBe(200)
    expect(verified.json.account).toEqual({ email: 'ana@example.com' })
    expect(verified.json.player.nickname).toBe('Ana')

    const token = await mailLinkToken(ana)
    const reuse = await ana.request('/api/auth/magic/verify', { body: { token } })
    expect(reuse.status).toBe(400)
  })

  it('expire after 15 minutes', async () => {
    const ana = browser()
    await ana.request('/api/session', { body: {} })
    await ana.request('/api/auth/magic', { body: { email: 'ana@example.com' } })
    const token = await mailLinkToken(ana)
    clock += 16 * 60_000
    expect((await ana.request('/api/auth/magic/verify', { body: { token } })).status).toBe(400)
  })

  it('are rate limited per email and per address', async () => {
    const ana = browser()
    await ana.request('/api/session', { body: {} })
    for (let i = 0; i < 3; i++) {
      expect(
        (await ana.request('/api/auth/magic', { body: { email: 'a@example.com' } })).status,
      ).toBe(202)
    }
    expect(
      (await ana.request('/api/auth/magic', { body: { email: 'A@example.com' } })).status,
    ).toBe(429)
    // Other emails still work, until this address has asked 10 times in the hour.
    for (let i = 0; i < 6; i++) {
      expect(
        (await ana.request('/api/auth/magic', { body: { email: `b${i}@example.com` } })).status,
      ).toBe(202)
    }
    expect(
      (await ana.request('/api/auth/magic', { body: { email: 'c@example.com' } })).status,
    ).toBe(429)
    clock += 61 * 60_000
    expect(
      (await ana.request('/api/auth/magic', { body: { email: 'c@example.com' } })).status,
    ).toBe(202)
  })

  it('reject bad addresses and unknown tokens', async () => {
    const ana = browser()
    await ana.request('/api/session', { body: {} })
    expect((await ana.request('/api/auth/magic', { body: { email: 'nope' } })).status).toBe(400)
    expect(
      (await ana.request('/api/auth/magic/verify', { body: { token: 'made-up' } })).status,
    ).toBe(400)
  })

  it('carry the account to a second device', async () => {
    const laptop = browser()
    await laptop.request('/api/session', { body: {} })
    await laptop.request('/api/nickname', { method: 'PUT', body: { nickname: 'Ana' } })
    const first = await signInByEmail(laptop, 'ana@example.com')

    const phone = browser()
    const anonymous = await phone.request('/api/session', { body: {} })
    await phone.request('/api/nickname', { method: 'PUT', body: { nickname: 'Phone' } })
    const second = await signInByEmail(phone, 'ana@example.com')
    expect(second.json.player.id).toBe(first.json.player.id)
    expect(second.json.player.nickname).toBe('Ana')
    // The anonymous player the phone started with is gone, and its name is free again.
    const db = new DatabaseSync(join(dir, 'test.sqlite'), { readOnly: true })
    expect(
      db.prepare('SELECT 1 FROM players WHERE id = ?').get(anonymous.json.player.id),
    ).toBeUndefined()
    db.close()
  })

  it('can be signed out of, leaving a fresh anonymous player on the next visit', async () => {
    const ana = browser()
    await ana.request('/api/session', { body: {} })
    const signedIn = await signInByEmail(ana, 'ana@example.com')
    expect((await ana.request('/api/auth/signout', { body: {} })).status).toBe(200)
    const after = await ana.request('/api/session', { body: {} })
    expect(after.json.account).toBeNull()
    expect(after.json.player.id).not.toBe(signedIn.json.player.id)
  })
})

describe('cloud profile', () => {
  it('needs an account, and saves with version checks', async () => {
    const ana = browser()
    await ana.request('/api/session', { body: {} })
    expect((await ana.request('/api/profile')).status).toBe(401)
    await signInByEmail(ana, 'ana@example.com')

    expect((await ana.request('/api/profile')).json).toEqual({
      version: 0,
      updated: 0,
      profile: null,
    })
    const profile = { ...emptyProfile(), xp: 120 }
    const saved = await ana.request('/api/profile', {
      method: 'PUT',
      body: { baseVersion: 0, profile },
    })
    expect(saved.json).toEqual({ version: 1 })
    expect((await ana.request('/api/profile')).json).toMatchObject({
      version: 1,
      profile: { xp: 120 },
    })

    // Saving from an older version is refused, and the answer carries the newer profile.
    const stale = await ana.request('/api/profile', {
      method: 'PUT',
      body: { baseVersion: 0, profile: emptyProfile() },
    })
    expect(stale.status).toBe(409)
    expect(stale.json).toMatchObject({ version: 1, profile: { xp: 120 } })

    const next = await ana.request('/api/profile', {
      method: 'PUT',
      body: { baseVersion: 1, profile: { ...profile, xp: 200 } },
    })
    expect(next.json).toEqual({ version: 2 })
  })

  it('is shared between devices and cleaned on the way in', async () => {
    const laptop = browser()
    await laptop.request('/api/session', { body: {} })
    await signInByEmail(laptop, 'ana@example.com')
    await laptop.request('/api/profile', {
      method: 'PUT',
      body: { baseVersion: 0, profile: { version: 2, xp: -5, history: 'junk', cosmetics: [] } },
    })
    const phone = browser()
    await phone.request('/api/session', { body: {} })
    await signInByEmail(phone, 'ana@example.com')
    const { json } = await phone.request('/api/profile')
    expect(json.profile).toEqual(emptyProfile())
    expect(json.version).toBe(1)
  })

  it('refuses a huge profile', async () => {
    const ana = browser()
    await ana.request('/api/session', { body: {} })
    await signInByEmail(ana, 'ana@example.com')
    const huge = { ...emptyProfile(), history: Array(40_000).fill({ mode: 'pinpoint', score: 1 }) }
    const response = await ana.request('/api/profile', {
      method: 'PUT',
      body: { baseVersion: 0, profile: huge },
    })
    expect(response.status).toBe(413)
  })
})

describe('oauth', () => {
  async function start(person: Browser) {
    const response = await person.request('/api/auth/google/start')
    const state = new URL(response.response.headers.get('location')!).searchParams.get('state')!
    return { response, state }
  }

  it('is offline for providers that are not configured', async () => {
    const ana = browser()
    expect((await ana.request('/api/auth/github/start')).status).toBe(404)
    const session = await ana.request('/api/session', { body: {} })
    expect(session.json.providers).toEqual({ email: true, google: true, github: false })
  })

  it('signs in when the state matches, and the same person returns to the same account', async () => {
    const ana = browser()
    await ana.request('/api/session', { body: {} })
    const { response, state } = await start(ana)
    expect(response.status).toBe(302)
    const done = await ana.request(`/api/auth/google/callback?code=ok&state=${state}`)
    expect(done.response.headers.get('location')).toBe('http://play.test/#/settings?signin=ok')
    const profile = await ana.request('/api/session', { body: {} })
    expect(profile.json.account).toEqual({ email: 'ana@example.com' })

    // Later, on another device, with a changed email: the provider id still finds the account.
    identity = { subject: 'g-1', email: 'other@example.com', emailVerified: true }
    const phone = browser()
    await phone.request('/api/session', { body: {} })
    const { state: phoneState } = await start(phone)
    await phone.request(`/api/auth/google/callback?code=ok&state=${phoneState}`)
    const again = await phone.request('/api/session', { body: {} })
    expect(again.json.player.id).toBe(profile.json.player.id)
  })

  it('rejects a wrong state, a bad code and a missing cookie', async () => {
    const ana = browser()
    await ana.request('/api/session', { body: {} })
    const { state } = await start(ana)
    const wrongState = await ana.request('/api/auth/google/callback?code=ok&state=forged')
    expect(wrongState.response.headers.get('location')).toMatch(/signin=failed/)

    const { state: second } = await start(ana)
    const badCode = await ana.request(`/api/auth/google/callback?code=bad&state=${second}`)
    expect(badCode.response.headers.get('location')).toMatch(/signin=failed/)

    const stranger = browser()
    await stranger.request('/api/session', { body: {} })
    const noCookie = await stranger.request(`/api/auth/google/callback?code=ok&state=${state}`)
    expect(noCookie.response.headers.get('location')).toMatch(/signin=failed/)
    expect((await ana.request('/api/session', { body: {} })).json.account).toBeNull()
  })

  it('does not link accounts through an unverified email', async () => {
    const ana = browser()
    await ana.request('/api/session', { body: {} })
    const first = await signInByEmail(ana, 'ana@example.com')

    identity = { subject: 'g-2', email: 'ana@example.com', emailVerified: false }
    const thief = browser()
    await thief.request('/api/session', { body: {} })
    const { state } = await start(thief)
    await thief.request(`/api/auth/google/callback?code=ok&state=${state}`)
    const result = await thief.request('/api/session', { body: {} })
    expect(result.json.player.id).not.toBe(first.json.player.id)
  })
})

describe('deleting data', () => {
  it('removes the account, its profile and the sign-in', async () => {
    const ana = browser()
    await ana.request('/api/session', { body: {} })
    const signed = await signInByEmail(ana, 'ana@example.com')
    await ana.request('/api/profile', {
      method: 'PUT',
      body: { baseVersion: 0, profile: emptyProfile() },
    })
    expect((await ana.request('/api/me', { method: 'DELETE' })).status).toBe(200)

    const db = new DatabaseSync(join(dir, 'test.sqlite'), { readOnly: true })
    for (const table of ['accounts', 'players', 'profiles', 'sessions']) {
      expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).toEqual({ n: 0 })
    }
    db.close()
    const next = await ana.request('/api/session', { body: {} })
    expect(next.json.player.id).not.toBe(signed.json.player.id)
  })
})
