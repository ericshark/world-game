import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS } from './achievements'
import { COSMETICS, isUnlocked, unlockedAt, unlockedBy } from './cosmetics'

const all = Object.values(COSMETICS).flat()

describe('cosmetics', () => {
  it('has about twenty looks to earn, each kind with a free default', () => {
    expect(all.length).toBeGreaterThanOrEqual(20)
    for (const list of Object.values(COSMETICS)) {
      expect(list[0].unlock).toEqual({ level: 1 })
      expect(new Set(list.map((c) => c.id)).size).toBe(list.length)
    }
  })

  it('only refers to achievements that exist', () => {
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id))
    for (const cosmetic of all) {
      if ('achievement' in cosmetic.unlock) expect(ids).toContain(cosmetic.unlock.achievement)
    }
  })

  it('unlocks by level or by achievement', () => {
    const [, sky] = COSMETICS.pin
    const flag = COSMETICS.shape.find((c) => c.id === 'flag')!
    expect(isUnlocked(sky, { level: 2, achievements: {} })).toBe(false)
    expect(isUnlocked(sky, { level: 3, achievements: {} })).toBe(true)
    expect(isUnlocked(flag, { level: 50, achievements: {} })).toBe(false)
    expect(isUnlocked(flag, { level: 1, achievements: { expedition: 1 } })).toBe(true)
  })

  it('lists what a level or an achievement newly unlocks', () => {
    expect(unlockedAt(3).map((c) => c.id)).toEqual(['sky'])
    expect(unlockedBy(['expedition']).map((c) => c.id)).toEqual(['flag'])
  })
})
