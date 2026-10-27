import type { IncomingHttpHeaders } from 'node:http'
import type { MiddlewareHandler } from 'hono'
import type { ServerConfig } from './config'

/** The headers every response carries, including a content security policy for the page. */
export function securityHeaders(config: ServerConfig): MiddlewareHandler {
  const socketOrigin = config.publicOrigin.replace(/^http/, 'ws')
  const https = config.publicOrigin.startsWith('https:')
  const policy = [
    "default-src 'self'",
    // Built scripts are all files from this site; there are no inline scripts.
    "script-src 'self'",
    // The game sets styles from code (React style attributes, the globe's labels).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // The real-time connection must be named: not every browser reads 'self' as ws://.
    `connect-src 'self' ${socketOrigin}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Only on an https site: asking a plain-http one (a local production test) to upgrade breaks it.
    ...(config.production && https ? ['upgrade-insecure-requests'] : []),
  ].join('; ')

  return async (c, next) => {
    await next()
    c.header('Content-Security-Policy', policy)
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
    c.header('Cross-Origin-Opener-Policy', 'same-origin')
    if (config.production && https) {
      c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }
    // Answers from the API are personal and must never be kept by a shared cache.
    if (c.req.path.startsWith('/api/')) c.header('Cache-Control', 'no-store')
  }
}

/** Whether a browser's `Origin` header names this site (or, while developing, this machine). */
export function originAllowed(origin: string | undefined, config: ServerConfig): boolean {
  // Requests that do not come from a web page (tools, tests, the proxy) send no Origin.
  if (origin === undefined) return true
  if (origin === config.publicOrigin || config.allowedOrigins.includes(origin)) return true
  if (config.production) return false
  try {
    const { hostname } = new URL(origin)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return false
  }
}

/** Refuses writes made on behalf of another site. Reads are harmless and always allowed. */
export function originGuard(config: ServerConfig): MiddlewareHandler {
  return async (c, next) => {
    const reads = c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS'
    if (!reads && !originAllowed(c.req.header('origin'), config)) {
      return c.json({ error: 'That request came from another site.' }, 403)
    }
    await next()
  }
}

/**
 * The address a request really came from. Behind a trusted proxy (Cloudflare, Caddy, Fly) that is
 * in a header; trusting the header without a proxy would let anyone pick their own address, so it
 * is opt-in. A proxy that appends to `X-Forwarded-For` instead of replacing it (Fly does) leaves
 * the first entry up to the player, so such a proxy's own header is named in `clientIpHeader`.
 */
export function clientIp(
  headers: IncomingHttpHeaders,
  remote: string | undefined,
  { trustProxy, clientIpHeader }: Pick<ServerConfig, 'trustProxy' | 'clientIpHeader'>,
): string {
  if (trustProxy) {
    const forwarded = clientIpHeader
      ? headers[clientIpHeader]
      : (headers['cf-connecting-ip'] ?? headers['x-forwarded-for'])
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
    if (first) return first
  }
  return remote ?? 'unknown'
}
