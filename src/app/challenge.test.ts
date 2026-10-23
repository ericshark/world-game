import { describe, expect, it } from 'vitest'
import { decodeChallenge, encodeChallenge } from './challenge'

describe('challenge links', () => {
  it('round-trip a mode, setup, seed and score through a URL-safe token', () => {
    const link = {
      mode: 'pinpoint' as const,
      seed: 'abc123',
      config: { region: 'Europe', night: true, note: 'Côte d’Ivoire' },
      score: 8420,
    }
    const token = encodeChallenge(link)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeChallenge(token)).toEqual(link)
  })

  it('rejects damaged tokens', () => {
    expect(decodeChallenge('not a token!')).toBeNull()
    expect(
      decodeChallenge(
        encodeChallenge({ mode: 'rush', seed: 's', config: {}, score: 1 }).slice(0, 5),
      ),
    ).toBeNull()
  })

  it('rejects modes that do not exist, including inherited object keys', () => {
    for (const mode of ['constructor', 'toString', '__proto__', 'chess']) {
      const token = encodeChallenge({ mode: mode as 'rush', seed: 's', config: {}, score: 1 })
      expect(decodeChallenge(token)).toBeNull()
    }
  })

  it('rejects impossible scores', () => {
    for (const score of [-1, Infinity, NaN, 1e12]) {
      const token = encodeChallenge({ mode: 'rush', seed: 's', config: {}, score })
      expect(decodeChallenge(token)).toBeNull()
    }
  })

  it('encode large setups without overflowing the stack', () => {
    const config = { notes: 'x'.repeat(300_000) }
    const token = encodeChallenge({ mode: 'pinpoint', seed: 's', config, score: 5 })
    expect(decodeChallenge(token)?.config).toEqual(config)
  })
})
