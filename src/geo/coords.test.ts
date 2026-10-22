import { describe, expect, it } from 'vitest'
import { normalizeLon } from './coords'

describe('normalizeLon', () => {
  it('wraps into [-180, 180)', () => {
    expect(normalizeLon(190)).toBeCloseTo(-170)
    expect(normalizeLon(-190)).toBeCloseTo(170)
    expect(normalizeLon(180)).toBeCloseTo(-180)
    expect(normalizeLon(45)).toBeCloseTo(45)
  })
})
