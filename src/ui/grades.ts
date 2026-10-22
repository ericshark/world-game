import { rarityTier, type RarityTier } from '../game/core/categories'
import type { RoundResult } from '../game/core/types'

export type Tone = 'perfect' | 'great' | 'good' | 'close' | 'miss'

export interface Grade {
  label: string
  tone: Tone
}

/** A one-word verdict for a round, shared by every mode that scores out of 1,000. */
export function gradeOf(result: RoundResult): Grade {
  if (result.kind === 'missed') return { label: "Time's up", tone: 'miss' }
  if (result.kind === 'category') {
    if (result.reused) return { label: 'Already used', tone: 'miss' }
    if (!result.valid) return { label: 'Not valid', tone: 'miss' }
    const tier = rarityTier(result.rarity)
    return { label: tier, tone: TIER_TONES[tier] }
  }
  if (result.kind === 'identify') {
    if (result.verdict === 'correct') return { label: 'Correct', tone: 'perfect' }
    return result.verdict === 'neighbor'
      ? { label: 'Next door', tone: 'close' }
      : { label: 'Miss', tone: 'miss' }
  }
  if (result.hit) return { label: 'Perfect', tone: 'perfect' }
  return gradeOfPoints(result.points)
}

const TIER_TONES: Record<RarityTier, Tone> = {
  Common: 'good',
  Uncommon: 'great',
  Rare: 'perfect',
  Exotic: 'perfect',
  Legendary: 'perfect',
}

export function gradeOfPoints(points: number): Grade {
  if (points >= 900) return { label: 'Excellent', tone: 'great' }
  if (points >= 600) return { label: 'Great', tone: 'great' }
  if (points >= 300) return { label: 'Good', tone: 'good' }
  if (points >= 50) return { label: 'Close', tone: 'close' }
  return { label: 'Miss', tone: 'miss' }
}
