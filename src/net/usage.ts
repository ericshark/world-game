export const USAGE_EVENTS = [
  'visit',
  'mode:pinpoint',
  'mode:rush',
  'mode:rare-earth',
  'mode:mystery',
  'mode:journey',
  'mode:battle',
  'mode:daily',
  'mode:learn',
  'mode:atlas',
  'mode:online',
  'finish:pinpoint',
  'finish:rush',
  'finish:rare-earth',
  'finish:mystery',
  'finish:journey',
  'finish:daily',
  'finish:learn',
  'finish:battle',
  'room:created',
  'duel:matched',
] as const

export type UsageEvent = (typeof USAGE_EVENTS)[number]

/**
 * Sends a first-party, cookie-less count of a visit or mode played. `credentials: 'omit'` keeps
 * session cookies off the wire so counts can never be tied to a player or account.
 */
export function recordUsage(event: UsageEvent) {
  if (typeof fetch !== 'function') return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  fetch('/api/usage', {
    method: 'POST',
    credentials: 'omit',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event }),
    keepalive: true,
  }).catch(() => {})
}
