import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import type { MiddlewareHandler } from 'hono'

const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
}

/** Where the build step leaves a brotli copy of each text file, next to the original. */
export const BROTLI_EXTENSION = '.br'

/**
 * Serves the build's pre-compressed (`.br`) copy of a text file to browsers that accept
 * brotli. Compressing once at build time costs nothing per request and shrinks the country
 * data and scripts by a large factor.
 */
export function precompressed(distDir: string): MiddlewareHandler {
  const root = resolve(distDir)
  const cache = new Map<string, { body: Uint8Array<ArrayBuffer>; mtime: number } | null>()

  return async (c, next) => {
    const accepts = c.req.header('accept-encoding') ?? ''
    const path = c.req.path
    const type = TYPES[extname(path)]
    if (c.req.method !== 'GET' || !type || !/\bbr\b/.test(accepts)) return next()

    let decoded: string
    try {
      decoded = decodeURIComponent(path)
    } catch {
      return next()
    }
    const file = normalize(join(root, decoded))
    if (!file.startsWith(root + sep)) return next()
    const compressed = file + BROTLI_EXTENSION
    if (!existsSync(compressed)) return next()

    const mtime = statSync(compressed).mtimeMs
    let entry = cache.get(compressed)
    if (!entry || entry.mtime !== mtime) {
      entry = { body: new Uint8Array(readFileSync(compressed)), mtime }
      cache.set(compressed, entry)
    }
    return c.body(entry.body, 200, {
      'content-type': type,
      'content-encoding': 'br',
      vary: 'Accept-Encoding',
    })
  }
}
