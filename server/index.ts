// The World Game server: one Node process serving the built site, the JSON API and the
// real-time WebSocket (`/ws`). Run it with `npm run server`; the Vite dev server forwards
// `/api` and `/ws` here.
import { readFileSync } from 'node:fs'
import type { Server } from 'node:http'
import { serve } from '@hono/node-server'
import { CountryIndex, type CountryCollection } from '../src/geo/countries'
import { GeoData, type FactsFile } from '../src/geo/facts'
import { createApp } from './app'
import { DevMailer, ResendMailer, type Mailer } from './auth/mail'
import { configuredProviders, type OAuthProvider, type OAuthProviderId } from './auth/oauth'
import { DEFAULT_PORT, loadConfig, type ServerConfig } from './config'
import { openDatabase } from './db'
import { attachRealtime } from './realtime'

export { DEFAULT_PORT }

export function loadServerGeo(): GeoData {
  const read = <T>(file: string) =>
    JSON.parse(readFileSync(new URL(`../public/data/${file}`, import.meta.url), 'utf8')) as T
  return new GeoData(
    new CountryIndex(read<CountryCollection>('countries.json')),
    read<FactsFile>('facts.json'),
  )
}

export interface RunningServer {
  port: number
  config: ServerConfig
  close(): Promise<void>
}

export async function startServer({
  config = loadConfig(),
  geo = loadServerGeo(),
  now = Date.now,
  mailer,
  oauth = configuredProviders(config),
}: {
  config?: ServerConfig
  geo?: GeoData
  now?: () => number
  mailer?: Mailer
  oauth?: Map<OAuthProviderId, OAuthProvider>
} = {}): Promise<RunningServer> {
  const db = openDatabase(config.databasePath)
  let realtime: ReturnType<typeof attachRealtime> | null = null
  const dev = mailer ?? (config.resendApiKey || config.production ? null : new DevMailer())
  const app = createApp({
    config,
    db,
    roomCount: () => realtime?.roomCount() ?? 0,
    now,
    mailer:
      dev ??
      new ResendMailer(
        config.resendApiKey!,
        process.env.MAIL_FROM ?? 'World Game <noreply@localhost>',
      ),
    devMailbox: dev instanceof DevMailer ? dev.outbox : null,
    oauth,
  })

  const http = await new Promise<Server>((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, () => {
      server.off('error', reject)
      resolve(server as Server)
    })
    server.once('error', reject)
  })
  realtime = attachRealtime(http, geo)
  const address = http.address()

  return {
    port: typeof address === 'object' && address ? address.port : config.port,
    config,
    close: () =>
      new Promise((resolve) => {
        realtime?.close()
        http.close(() => {
          db.close()
          resolve()
        })
        http.closeAllConnections()
      }),
  }
}

/** Tries the port, then the next ones, until one is free (development only). */
async function startOnFreePort(config: ServerConfig): Promise<RunningServer> {
  const attempts = config.production ? 1 : 20
  for (let port = config.port; port < config.port + attempts; port++) {
    try {
      return await startServer({ config: { ...config, port } })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
    }
  }
  throw new Error(`No free port from ${config.port}`)
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const server = await startOnFreePort(loadConfig())
  console.log(`World Game server on port ${server.port} (site, /api and ws path /ws)`)
  const stop = async () => {
    await server.close()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
