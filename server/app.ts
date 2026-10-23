import { existsSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import type { ServerConfig } from './config'
import { authRoutes } from './auth/routes'
import { dailyRoutes } from './daily'
import type { GeoData } from '../src/geo/facts'
import type { Mail, Mailer } from './auth/mail'
import type { OAuthProvider, OAuthProviderId } from './auth/oauth'
import type { Database } from './db'

export interface AppContext {
  config: ServerConfig
  geo: GeoData
  db: Database
  /** For /health: how many battle rooms are open. */
  roomCount: () => number
  now: () => number
  mailer: Mailer
  /** Sent emails, only when mail is going to the development mailbox. */
  devMailbox: Mail[] | null
  oauth: Map<OAuthProviderId, OAuthProvider>
}

/** The HTTP side: the JSON API, health check and the built site. */
export function createApp(context: AppContext) {
  const app = new Hono()

  app.get('/health', (c) => c.text(`ok ${context.roomCount()} rooms`))

  const api = new Hono()
  const auth = authRoutes(api, context)
  dailyRoutes(api, context, auth)
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
      const hashed = c.req.path.startsWith('/assets/')
      c.header('cache-control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache')
    })
    app.use('*', serveStatic({ root }))
    app.get('*', serveStatic({ root, path: 'index.html' }))
  }
  return app
}

/** serveStatic resolves roots against the working directory. */
function relativeRoot(distDir: string) {
  return relative(process.cwd(), resolve(distDir)) || '.'
}
