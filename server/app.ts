import { timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { extname, relative, resolve } from 'node:path'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { serveStatic } from '@hono/node-server/serve-static'
import type { ServerConfig } from './config'
import { authRoutes } from './auth/routes'
import { dailyRoutes } from './daily'
import { leaderboardRoutes } from './leaderboards'
import { log } from './log'
import { precompressed } from './precompressed'
import { originGuard, securityHeaders } from './security'
import type { GeoData } from '../src/geo/facts'
import type { Mail, Mailer } from './auth/mail'
import type { OAuthProvider, OAuthProviderId } from './auth/oauth'
import type { Database } from './db'

/** The biggest request body: a profile is the largest thing sent, and is capped lower still. */
export const MAX_API_BODY_BYTES = 600 * 1024

export interface AppContext {
  config: ServerConfig
  geo: GeoData
  db: Database
  /** For /health: how many battle rooms are open. */
  roomCount: () => number
  /** Live figures for the counters endpoint. */
  stats: () => { rooms: number; sockets: number; queued: number }
  now: () => number
  /** Null when email sign-in is not available. */
  mailer: Mailer | null
  /** Sent emails, only when mail is going to the development mailbox. */
  devMailbox: Mail[] | null
  oauth: Map<OAuthProviderId, OAuthProvider>
}

/** The HTTP side: the JSON API, health check and the built site. */
export function createApp(context: AppContext) {
  const app = new Hono()
  app.use('*', securityHeaders(context.config))
  app.use('/api/*', originGuard(context.config))
  // Nothing the API accepts is large; refuse big bodies before reading them.
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: MAX_API_BODY_BYTES,
      onError: (c) => c.json({ error: 'That request is too large.' }, 413),
    }),
  )

  app.use('*', async (c, next) => {
    const started = Date.now()
    await next()
    if (!context.config.logRequests || !c.req.path.startsWith('/api/')) return
    // The path only, never the query: it can hold sign-in codes.
    log(c.res.status >= 500 ? 'error' : 'info', 'http', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Date.now() - started,
    })
  })

  // Liveness: the process is up. Readiness: it can also reach its database.
  app.get('/health', (c) => c.text(`ok ${context.roomCount()} rooms`))
  app.get('/health/ready', (c) => {
    try {
      context.db.prepare('SELECT 1').get()
      return c.json({ status: 'ready' })
    } catch {
      return c.json({ status: 'database unavailable' }, 503)
    }
  })

  const startedAt = Date.now()
  app.get('/admin/counters', (c) => {
    const expected = context.config.metricsToken
    const given = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const same =
      expected !== null &&
      given.length === expected.length &&
      timingSafeEqual(Buffer.from(given), Buffer.from(expected))
    // Closed unless a token is set; and the same answer for a wrong token as for no endpoint.
    if (!same) return c.json({ error: 'Not found.' }, 404)
    const count = (table: string) =>
      Number((context.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n)
    return c.json({
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      ...context.stats(),
      players: count('players'),
      accounts: count('accounts'),
      dailySessions: count('daily_sessions'),
      matches: count('matches'),
      memoryMB: Math.round(process.memoryUsage().rss / 1e6),
    })
  })

  const api = new Hono()
  const auth = authRoutes(api, context)
  dailyRoutes(api, context, auth)
  leaderboardRoutes(api, context, auth)
  app.route('/api', api)
  app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404))

  const { distDir } = context.config
  if (distDir && existsSync(resolve(distDir, 'index.html'))) {
    const root = relativeRoot(distDir)
    // Built files have hashed names, so browsers may keep them forever; the page itself must
    // be re-checked so a new deploy is picked up.
    app.use('*', async (c, next) => {
      await next()
      if (!c.res.ok || c.res.headers.has('cache-control')) return
      c.header('cache-control', cacheControl(c.req.path, c.req.query('v') !== undefined))
    })
    // The page names this site's address in its sharing tags, which only the server knows.
    const page = readFileSync(resolve(distDir, 'index.html'), 'utf8').replaceAll(
      '%PUBLIC_ORIGIN%',
      context.config.publicOrigin,
    )
    app.get('/', (c) => c.html(page))
    app.get('/index.html', (c) => c.html(page))
    app.use('*', precompressed(distDir))
    app.use('*', serveStatic({ root }))
    // Any other address is a screen of the app (they live in the URL hash, but a deep link may
    // arrive without one); a missing file is a real 404.
    app.get('*', (c) => (extname(c.req.path) ? c.notFound() : c.html(page)))
  }
  return app
}

/** serveStatic resolves roots against the working directory. */
function relativeRoot(distDir: string) {
  return relative(process.cwd(), resolve(distDir)) || '.'
}

/**
 * Built scripts and styles have hashed names, and the globe's textures and data are asked for
 * with a `?v=` version of their content, so browsers may keep all of those forever. The page
 * itself must be re-checked so a new deploy is noticed.
 */
export function cacheControl(path: string, versioned: boolean): string {
  if (path.startsWith('/assets/')) return 'public, max-age=31536000, immutable'
  if (path.startsWith('/textures/') || path.startsWith('/data/')) {
    return versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=3600'
  }
  return 'no-cache'
}
