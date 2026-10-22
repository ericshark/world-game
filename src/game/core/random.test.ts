import { describe, expect, it } from 'vitest'
import { createRandom, hashString, randomSeed, shuffled } from './random'

describe('createRandom', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = createRandom('daily:42')
    const b = createRandom('daily:42')
    const sequence = Array.from({ length: 5 }, () => a())
    expect(Array.from({ length: 5 }, () => b())).toEqual(sequence)
    expect(sequence.every((value) => value >= 0 && value < 1)).toBe(true)
  })

  it('gives different sequences for different seeds', () => {
    expect(createRandom('a')()).not.toBe(createRandom('b')())
  })

  // Golden values: if these change, every saved seed (daily puzzles, challenge links) changes.
  it('is stable across engines and releases', () => {
    expect(hashString('world')).toBe(933488787)
    const random = createRandom('world')
    expect([random(), random()].map((v) => v.toFixed(8))).toEqual(['0.47915912', '0.41839284'])
  })
})

describe('shuffled', () => {
  it('keeps every item and leaves the input alone', () => {
    const items = [1, 2, 3, 4, 5, 6]
    const result = shuffled(items, createRandom('x'))
    expect([...result].sort()).toEqual(items)
    expect(items).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('randomSeed', () => {
  it('makes distinct seeds', () => {
    expect(randomSeed()).not.toBe(randomSeed())
  })
})
