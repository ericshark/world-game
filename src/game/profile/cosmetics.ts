/**
 * Looks the player can pick: pin colours and shapes, arc trails, the globe's glow and a title.
 * Earned by levelling up or by achievements, and purely cosmetic: nothing gates gameplay.
 */
export type CosmeticKind = 'pin' | 'shape' | 'trail' | 'glow' | 'title'

export type PinShape = 'classic' | 'diamond' | 'ring' | 'flag'
export type TrailStyle = 'solid' | 'dashed' | 'comet' | 'rainbow'

export type Unlock = { level: number } | { achievement: string }

export interface Cosmetic {
  id: string
  kind: CosmeticKind
  label: string
  /** Pins and glows: the colour; shapes and trails: a swatch for the picker. */
  color: string
  unlock: Unlock
}

const atLevel = (level: number): Unlock => ({ level })
const forAchievement = (achievement: string): Unlock => ({ achievement })

export const PIN_SKINS: Cosmetic[] = [
  { id: 'coral', kind: 'pin', label: 'Coral', color: '#ff6b6b', unlock: atLevel(1) },
  { id: 'sky', kind: 'pin', label: 'Sky', color: '#5ad1ff', unlock: atLevel(3) },
  { id: 'mint', kind: 'pin', label: 'Mint', color: '#6be38a', unlock: atLevel(5) },
  { id: 'violet', kind: 'pin', label: 'Violet', color: '#b98aff', unlock: atLevel(8) },
  { id: 'rose', kind: 'pin', label: 'Rose', color: '#ff7ad9', unlock: atLevel(12) },
  { id: 'pearl', kind: 'pin', label: 'Pearl', color: '#f5f5f5', unlock: atLevel(16) },
  { id: 'ember', kind: 'pin', label: 'Ember', color: '#ff9a4a', unlock: atLevel(20) },
]

export const PIN_SHAPES: Cosmetic[] = [
  { id: 'classic', kind: 'shape', label: 'Round', color: '#cfd8e6', unlock: atLevel(1) },
  { id: 'diamond', kind: 'shape', label: 'Diamond', color: '#cfd8e6', unlock: atLevel(6) },
  { id: 'ring', kind: 'shape', label: 'Ring', color: '#cfd8e6', unlock: atLevel(10) },
  {
    id: 'flag',
    kind: 'shape',
    label: 'Flag',
    color: '#cfd8e6',
    unlock: forAchievement('expedition'),
  },
]

export const TRAILS: Cosmetic[] = [
  { id: 'solid', kind: 'trail', label: 'Classic', color: '#ffffff', unlock: atLevel(1) },
  { id: 'dashed', kind: 'trail', label: 'Dashed', color: '#ffffff', unlock: atLevel(4) },
  { id: 'comet', kind: 'trail', label: 'Comet', color: '#5ad1ff', unlock: atLevel(9) },
  {
    id: 'rainbow',
    kind: 'trail',
    label: 'Rainbow',
    color: 'linear-gradient(90deg, #ff6b6b, #ffd54a, #6be38a, #5ad1ff, #b98aff)',
    unlock: forAchievement('whole-world'),
  },
]

export const GLOWS: Cosmetic[] = [
  { id: 'classic', kind: 'glow', label: 'Classic blue', color: '#5aa9ff', unlock: atLevel(1) },
  { id: 'aurora', kind: 'glow', label: 'Aurora', color: '#4dffb0', unlock: atLevel(4) },
  { id: 'dusk', kind: 'glow', label: 'Dusk', color: '#b07aff', unlock: atLevel(7) },
  { id: 'solar', kind: 'glow', label: 'Solar', color: '#ffb347', unlock: atLevel(11) },
  {
    id: 'nightfall',
    kind: 'glow',
    label: 'Nightfall',
    color: '#7f8dff',
    unlock: forAchievement('night-owl'),
  },
]

/** Titles shown beside your name; each one is a story of something you did. */
export const TITLES: Cosmetic[] = [
  { id: 'none', kind: 'title', label: 'No title', color: '#cfd8e6', unlock: atLevel(1) },
  {
    id: 'globetrotter',
    kind: 'title',
    label: 'Globetrotter',
    color: '#cfd8e6',
    unlock: forAchievement('globetrotter'),
  },
  {
    id: 'speedster',
    kind: 'title',
    label: 'Speedster',
    color: '#cfd8e6',
    unlock: forAchievement('rush-20'),
  },
  {
    id: 'trailblazer',
    kind: 'title',
    label: 'Trailblazer',
    color: '#cfd8e6',
    unlock: forAchievement('all-expeditions'),
  },
  {
    id: 'collector',
    kind: 'title',
    label: 'Rarity collector',
    color: '#cfd8e6',
    unlock: forAchievement('legendary'),
  },
  {
    id: 'sleuth',
    kind: 'title',
    label: 'Sleuth',
    color: '#cfd8e6',
    unlock: forAchievement('mystery-3'),
  },
  {
    id: 'champion',
    kind: 'title',
    label: 'Champion',
    color: '#cfd8e6',
    unlock: forAchievement('battle-flawless'),
  },
  {
    id: 'devoted',
    kind: 'title',
    label: 'Devoted',
    color: '#cfd8e6',
    unlock: forAchievement('streak-30'),
  },
]

export const COSMETICS: Record<CosmeticKind, Cosmetic[]> = {
  pin: PIN_SKINS,
  shape: PIN_SHAPES,
  trail: TRAILS,
  glow: GLOWS,
  title: TITLES,
}

export function cosmeticById(list: Cosmetic[], id: string): Cosmetic {
  return list.find((c) => c.id === id) ?? list[0]
}

export function isUnlocked(
  cosmetic: Cosmetic,
  { level, achievements }: { level: number; achievements: Record<string, number> },
): boolean {
  return 'level' in cosmetic.unlock
    ? level >= cosmetic.unlock.level
    : cosmetic.unlock.achievement in achievements
}

/** The pin shape for a saved choice, falling back to the classic one. */
export function pinShapeOf(id: string): PinShape {
  return cosmeticById(PIN_SHAPES, id).id as PinShape
}

/** Cosmetics that become available on reaching this level. */
export function unlockedAt(level: number): Cosmetic[] {
  return Object.values(COSMETICS)
    .flat()
    .filter((c) => 'level' in c.unlock && c.unlock.level === level)
}

/** Cosmetics earned by these achievements. */
export function unlockedBy(achievementIds: string[]): Cosmetic[] {
  return Object.values(COSMETICS)
    .flat()
    .filter((c) => 'achievement' in c.unlock && achievementIds.includes(c.unlock.achievement))
}
