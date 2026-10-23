import type { Hono, Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { getConnInfo } from '@hono/node-server/conninfo'
import { normalizeProfile } from '../../src/game/profile/profile'
import type { AppContext } from '../app'
import { clientIp } from '../security'
import { checkNickname } from './nickname'
import { generateCodeVerifier, generateState, type OAuthProviderId } from './oauth'
import { RateLimiter } from './rateLimit'
import { AuthStore, SESSION_MS, type PlayerRow } from './store'

const SESSION_COOKIE = 'wg_session'
const OAUTH_COOKIE = 'wg_oauth'
const MAX_PROFILE_BYTES = 512 * 1024
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/

interface Signed {
  player: PlayerRow
  token: string
}

export interface Authentication {
  /** The player making the request, if the session cookie is good. */
  signedIn(c: Context): { player: PlayerRow; token: string } | null
}

/** Adds the identity routes to the API and says how other routes can tell who is calling. */
export function authRoutes(
  api: Hono,
  { config, db, now, mailer, devMailbox, oauth }: AppContext,
): Authentication {
  const store = new AuthStore(db, now)
  const secure = config.publicOrigin.startsWith('https:')
  const perEmail = new RateLimiter(3, 15 * 60_000, now)
  const perIp = new RateLimiter(config.magicLinksPerIpPerHour, 60 * 60_000, now)
  const newSessions = new RateLimiter(config.newSessionsPerIpPerHour, 60 * 60_000, now)
  const nicknameChanges = new RateLimiter(10, 60_000, now)
  const ipOf = (c: Context) =>
    clientIp(
      {
        'cf-connecting-ip': c.req.header('cf-connecting-ip'),
        'x-forwarded-for': c.req.header('x-forwarded-for'),
      },
      getConnInfo(c).remote.address,
      config.trustProxy,
    )

  const cookieOptions = (maxAge: number, path = '/') => ({
    httpOnly: true,
    sameSite: 'Lax' as const,
    secure,
    path,
    maxAge,
  })
  const setSession = (c: Context, token: string) =>
    setCookie(c, SESSION_COOKIE, token, cookieOptions(SESSION_MS / 1000))

  const signedIn = (c: Context): Signed | null => {
    const token = getCookie(c, SESSION_COOKIE)
    const player = token ? store.playerForSession(token) : null
    return token && player ? { player, token } : null
  }

  const me = (c: Context, { player }: Signed) => {
    const account = store.account(player.accountId)
    return c.json({
      player: { id: player.id, nickname: player.nickname },
      account: account ? { email: account.email } : null,
      providers: { email: true, google: oauth.has('google'), github: oauth.has('github') },
    })
  }

  // Writes must be JSON, which a form on another site cannot send without a preflight; that,
  // with SameSite=Lax cookies, keeps other sites from acting for a signed-in player.
  api.use('*', async (c, next) => {
    const writes = c.req.method === 'POST' || c.req.method === 'PUT'
    if (writes && !(c.req.header('content-type') ?? '').startsWith('application/json')) {
      return c.json({ error: 'Send JSON.' }, 415)
    }
    await next()
  })

  const body = async (c: Context): Promise<Record<string, unknown>> => {
    try {
      const data: unknown = await c.req.json()
      return typeof data === 'object' && data !== null && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }

  /** Starts an anonymous player on first contact, and reports who this is. */
  api.post('/session', (c) => {
    let current = signedIn(c)
    if (!current) {
      // Each visit without a cookie makes a row, so one address may only make so many.
      if (!newSessions.take(ipOf(c)))
        return c.json({ error: 'Too many new sessions. Try later.' }, 429)
      current = store.startAnonymous()
      setSession(c, current.token)
    }
    return me(c, current)
  })

  api.put('/nickname', async (c) => {
    const current = signedIn(c)
    if (!current) return c.json({ error: 'Start a session first.' }, 401)
    if (!nicknameChanges.take(current.player.id)) {
      return c.json({ error: 'Slow down: too many nickname changes.' }, 429)
    }
    const checked = checkNickname((await body(c)).nickname)
    if (!checked.ok) return c.json({ error: checked.reason }, 400)
    current.player.nickname = store.setNickname(current.player.id, checked.name)
    return me(c, current)
  })

  // Sign-in by email

  api.post('/auth/magic', async (c) => {
    const email = String((await body(c)).email ?? '').trim()
    if (!EMAIL.test(email) || email.length > 254)
      return c.json({ error: 'Enter a valid email.' }, 400)
    if (!perIp.take(ipOf(c)) || !perEmail.take(email.toLowerCase())) {
      return c.json({ error: 'Too many sign-in emails. Try again later.' }, 429)
    }
    const token = store.createMagicLink(email)
    try {
      await mailer.send({
        to: email,
        subject: 'Your World Game sign-in link',
        text: `Open this link to sign in to World Game. It works once and expires in 15 minutes.\n\n${config.publicOrigin}/#/signin/${token}\n\nIf you did not ask for this, ignore this email.`,
      })
    } catch {
      return c.json({ error: 'The email could not be sent. Try again later.' }, 502)
    }
    // The same answer whether or not the address has an account.
    return c.json({ ok: true }, 202)
  })

  api.post('/auth/magic/verify', async (c) => {
    const current = signedIn(c)
    if (!current) return c.json({ error: 'Start a session first.' }, 401)
    const token = (await body(c)).token
    const email = typeof token === 'string' ? store.consumeMagicLink(token) : null
    if (!email) return c.json({ error: 'That link has expired or was already used.' }, 400)
    const account = store.accountFor({ email })
    const signed = store.signIn(current.token, current.player, account.id)
    setSession(c, signed.token)
    return me(c, signed)
  })

  // Sign-in with Google or GitHub

  api.get('/auth/:provider/start', (c) => {
    const provider = oauth.get(c.req.param('provider') as OAuthProviderId)
    if (!provider) return c.json({ error: 'That sign-in is not available.' }, 404)
    const state = generateState()
    const verifier = generateCodeVerifier()
    setCookie(
      c,
      OAUTH_COOKIE,
      JSON.stringify({ provider: provider.id, state, verifier }),
      cookieOptions(600, '/api/auth'),
    )
    return c.redirect(provider.authorizationUrl(state, verifier).toString())
  })

  api.get('/auth/:provider/callback', async (c) => {
    const failure = (reason: string) => {
      deleteCookie(c, OAUTH_COOKIE, { path: '/api/auth' })
      return c.redirect(`${config.publicOrigin}/#/settings?signin=${encodeURIComponent(reason)}`)
    }
    const provider = oauth.get(c.req.param('provider') as OAuthProviderId)
    const current = signedIn(c)
    let saved: { provider?: string; state?: string; verifier?: string } = {}
    try {
      saved = JSON.parse(getCookie(c, OAUTH_COOKIE) ?? '{}')
    } catch {
      // No usable cookie: handled as a failed check below.
    }
    const code = c.req.query('code')
    if (
      !provider ||
      !current ||
      !code ||
      saved.provider !== provider.id ||
      !saved.state ||
      saved.state !== c.req.query('state') ||
      !saved.verifier
    ) {
      return failure('failed')
    }
    try {
      const identity = await provider.identify(code, saved.verifier)
      const account = store.accountFor({
        email: identity.emailVerified ? identity.email : null,
        provider: {
          column: provider.id === 'google' ? 'google_id' : 'github_id',
          subject: identity.subject,
        },
      })
      setSession(c, store.signIn(current.token, current.player, account.id).token)
    } catch {
      return failure('failed')
    }
    deleteCookie(c, OAUTH_COOKIE, { path: '/api/auth' })
    return c.redirect(`${config.publicOrigin}/#/settings?signin=ok`)
  })

  api.post('/auth/signout', (c) => {
    const token = getCookie(c, SESSION_COOKIE)
    if (token) store.endSession(token)
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json({ ok: true })
  })

  /** Deletes the player's data: the account, its cloud profile and the sign-in. */
  api.delete('/me', (c) => {
    const current = signedIn(c)
    if (!current) return c.json({ error: 'Start a session first.' }, 401)
    store.deleteEverything(current.player)
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return c.json({ ok: true })
  })

  // Cloud profile

  api.get('/profile', (c) => {
    const current = signedIn(c)
    if (!current?.player.accountId) return c.json({ error: 'Sign in to sync your progress.' }, 401)
    const saved = store.profile(current.player.accountId)
    return c.json(
      saved
        ? { version: saved.version, updated: saved.updated, profile: JSON.parse(saved.json) }
        : { version: 0, updated: 0, profile: null },
    )
  })

  api.put('/profile', async (c) => {
    const current = signedIn(c)
    const accountId = current?.player.accountId
    if (!accountId) return c.json({ error: 'Sign in to sync your progress.' }, 401)
    const text = await c.req.text()
    if (text.length > MAX_PROFILE_BYTES) return c.json({ error: 'That profile is too large.' }, 413)
    let data: { baseVersion?: unknown; profile?: unknown }
    try {
      data = JSON.parse(text)
    } catch {
      return c.json({ error: 'Send JSON.' }, 400)
    }
    if (typeof data.baseVersion !== 'number' || typeof data.profile !== 'object' || !data.profile) {
      return c.json({ error: 'Send a baseVersion and a profile.' }, 400)
    }
    const profile = normalizeProfile(data.profile)
    const version = store.saveProfile(accountId, JSON.stringify(profile), data.baseVersion)
    if (version === null) {
      const latest = store.profile(accountId)!
      return c.json(
        { error: 'Out of date.', version: latest.version, profile: JSON.parse(latest.json) },
        409,
      )
    }
    return c.json({ version })
  })

  // The development mailbox shows sign-in emails that were never really sent.
  if (devMailbox) {
    // Sign-in links in this list let whoever reads them sign in. It is for a developer on this
    // machine: not reachable through a proxy, and never in production.
    api.get('/dev/mailbox', (c) => {
      const remote = getConnInfo(c).remote.address ?? ''
      const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)
      const proxied = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip')
      if (!loopback || proxied) return c.json({ error: 'Not found.' }, 404)
      return c.json(devMailbox)
    })
  }

  return { signedIn }
}
