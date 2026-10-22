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
})
