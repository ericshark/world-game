/**
 * Seeded random numbers. Daily puzzles, challenge links and multiplayer rounds all regenerate a
 * game from its seed, so this uses integer-only maths (Math.imul) that gives identical results
 * in every browser and in Node.
 */
export type Random = () => number

/** A uniform [0, 1) generator for the seed (mulberry32 over a 32-bit string hash). */
export function createRandom(seed: string): Random {
  let state = hashString(seed)
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
  }
}

/** FNV-1a. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** A fresh, unpredictable seed for a new game. */
export function randomSeed(): string {
  const values = crypto.getRandomValues(new Uint32Array(2))
  return Array.from(values, (value) => value.toString(36)).join('')
}

export function randomInt(random: Random, maxExclusive: number): number {
  return Math.floor(random() * maxExclusive)
}

/** A shuffled copy (Fisher–Yates). */
export function shuffled<T>(items: readonly T[], random: Random): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(random, i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
