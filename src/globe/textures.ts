export type Surface = 'day' | 'night'

const BASE = `${import.meta.env.BASE_URL}textures/`

/**
 * Phones and small GPUs get the 4096-wide textures: an 8192 texture needs ~170 MB of GPU memory
 * with mipmaps, enough to crash mobile Safari, and some GPUs cannot load it at all.
 */
export function prefersSmallTextures(maxTextureSize: number): boolean {
  if (maxTextureSize < 8192 || isAutomated()) return true
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return coarsePointer || (memory !== undefined && memory <= 4)
}

export function textureUrl(surface: Surface, small: boolean): string {
  const version = import.meta.env.VITE_ASSET_VERSION ?? 'dev'
  return `${BASE}${surface === 'night' ? 'night' : 'earth'}${small ? '-4k' : ''}.jpg?v=${version}`
}

/**
 * Browser automation (end-to-end tests) renders WebGL in software, where a full-resolution
 * globe is painfully slow; tests check behaviour, not pixels.
 */
export function isAutomated(): boolean {
  return typeof navigator !== 'undefined' && navigator.webdriver === true
}
