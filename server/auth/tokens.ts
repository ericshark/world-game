import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

/** An unguessable value for cookies and links. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Only hashes of tokens are stored, so a leaked database cannot be used to sign in. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Constant-time string comparison via fixed-length SHA-256 digests (avoids length leaks and UTF-8 RangeErrors). */
export function tokensEqual(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a).digest()
  const hashB = createHash('sha256').update(b).digest()
  return timingSafeEqual(hashA, hashB)
}

export function randomId(): string {
  return randomBytes(12).toString('base64url')
}

export function randomDigits(count: number): string {
  return Array.from({ length: count }, () => randomInt(10)).join('')
}
