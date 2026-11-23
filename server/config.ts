import { randomBytes } from 'node:crypto'

export const DEFAULT_PORT = 8788

export interface OAuthCredentials {
  clientId: string
  clientSecret: string
}

export interface ServerConfig {
  port: number
  host: string
  /** The address players use, for cookies, magic links and OAuth callbacks. */
  publicOrigin: string
  /** A file path, or `:memory:` for a throwaway database. */
  databasePath: string
  /** Seeds the ranked dailies. Keep it private: whoever has it can compute every answer. */
  dailySecret: string
  /** Sends magic links by email; without it they are logged and kept in the dev mailbox. */
  resendApiKey: string | null
  google: OAuthCredentials | null
  github: OAuthCredentials | null
  /** The built site served alongside the API; null skips static serving. */
  distDir: string | null
  /** Other origins (besides `publicOrigin`) allowed to use the API and the socket. */
  allowedOrigins: string[]
  /** Believe `X-Forwarded-For` and `CF-Connecting-IP`; only set this behind a trusted proxy. */
  trustProxy: boolean
  /**
   * With `trustProxy`, the one header that holds the player's address (lower case, e.g.
   * `fly-client-ip`); null reads `CF-Connecting-IP`, then the first `X-Forwarded-For` entry.
   */
  clientIpHeader: string | null
  /** Opens `/admin/counters` to whoever sends this as a bearer token; null keeps it closed. */
  metricsToken: string | null
  /** Write a log line for each API request (on by default in production). */
  logRequests: boolean
  /** New guest sessions one address may start per hour. */
  newSessionsPerIpPerHour: number
  /** Sign-in emails one address may ask for per hour. */
  magicLinksPerIpPerHour: number
  production: boolean
}

type Env = Record<string, string | undefined>

function oauth(env: Env, prefix: 'GOOGLE' | 'GITHUB'): OAuthCredentials | null {
  const clientId = env[`${prefix}_CLIENT_ID`]
  const clientSecret = env[`${prefix}_CLIENT_SECRET`]
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

function normalizeOrigin(raw: string): string {
  const url = new URL(raw)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`PUBLIC_ORIGIN must use http or https: ${raw}`)
  }
  return url.origin
}

/** Reads the server's settings from environment variables, with local-development defaults. */
export function loadConfig(env: Env = process.env, overrides: Partial<ServerConfig> = {}) {
  const production = env.NODE_ENV === 'production'
  const port = Number(env.PORT ?? DEFAULT_PORT)
  if (production && !env.DAILY_SECRET) {
    throw new Error('DAILY_SECRET must be set in production.')
  }
  const rawOrigin =
    overrides.publicOrigin ??
    (env.PUBLIC_ORIGIN || env.RENDER_EXTERNAL_URL || `http://localhost:${port}`)
  const config: ServerConfig = {
    port,
    host: env.HOST ?? '0.0.0.0',
    publicOrigin: normalizeOrigin(rawOrigin),
    databasePath: env.DATABASE_PATH ?? 'data-local/world-game.sqlite',
    // A random secret in development means dailies change on every restart, which is fine there.
    dailySecret: env.DAILY_SECRET ?? randomBytes(32).toString('hex'),
    resendApiKey: env.RESEND_API_KEY || null,
    google: oauth(env, 'GOOGLE'),
    github: oauth(env, 'GITHUB'),
    distDir: env.DIST_DIR ?? 'dist',
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
    trustProxy: env.TRUST_PROXY === '1',
    clientIpHeader: env.CLIENT_IP_HEADER?.trim().toLowerCase() || null,
    metricsToken: env.METRICS_TOKEN || null,
    logRequests: env.LOG_REQUESTS ? env.LOG_REQUESTS === '1' : production,
    newSessionsPerIpPerHour: Number(env.NEW_SESSIONS_PER_IP_PER_HOUR ?? 120),
    magicLinksPerIpPerHour: Number(env.MAGIC_LINKS_PER_IP_PER_HOUR ?? 10),
    production,
    ...overrides,
    ...(overrides.publicOrigin ? { publicOrigin: normalizeOrigin(overrides.publicOrigin) } : {}),
  }
  return config
}
