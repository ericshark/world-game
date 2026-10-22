/** Pin colours and globe glows unlocked by level. Purely cosmetic: nothing gates gameplay. */
export interface Cosmetic {
  id: string
  label: string
  color: string
  level: number
}

export const PIN_SKINS: Cosmetic[] = [
  { id: 'coral', label: 'Coral', color: '#ff6b6b', level: 1 },
  { id: 'sky', label: 'Sky', color: '#5ad1ff', level: 3 },
  { id: 'mint', label: 'Mint', color: '#6be38a', level: 5 },
  { id: 'violet', label: 'Violet', color: '#b98aff', level: 8 },
  { id: 'rose', label: 'Rose', color: '#ff7ad9', level: 12 },
  { id: 'pearl', label: 'Pearl', color: '#f5f5f5', level: 16 },
]

export const GLOWS: Cosmetic[] = [
  { id: 'classic', label: 'Classic blue', color: '#5aa9ff', level: 1 },
  { id: 'aurora', label: 'Aurora', color: '#4dffb0', level: 4 },
  { id: 'dusk', label: 'Dusk', color: '#b07aff', level: 7 },
  { id: 'solar', label: 'Solar', color: '#ffb347', level: 11 },
]

export function cosmeticById(list: Cosmetic[], id: string): Cosmetic {
  return list.find((c) => c.id === id) ?? list[0]
}

/** Cosmetics that become available on reaching this level. */
export function unlockedAt(level: number): Cosmetic[] {
  return [...PIN_SKINS, ...GLOWS].filter((c) => c.level === level)
}
