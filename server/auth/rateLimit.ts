/** Allows `limit` actions per key in any `windowMs` span. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>()

  private readonly limit: number
  private readonly windowMs: number
  private readonly now: () => number

  constructor(limit: number, windowMs: number, now: () => number) {
    this.limit = limit
    this.windowMs = windowMs
    this.now = now
  }

  /** Records an action and says whether it is allowed; refused actions do not count. */
  take(key: string): boolean {
    const now = this.now()
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs)
    if (recent.length >= this.limit) {
      this.hits.set(key, recent)
      return false
    }
    recent.push(now)
    this.hits.set(key, recent)
    if (this.hits.size > 10_000) this.prune(now)
    return true
  }

  /** Whether another action would be allowed, without recording one. */
  allows(key: string): boolean {
    const now = this.now()
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs)
    return recent.length < this.limit
  }

  private prune(now: number) {
    for (const [key, times] of this.hits) {
      if (times.every((at) => now - at >= this.windowMs)) this.hits.delete(key)
    }
  }
}
