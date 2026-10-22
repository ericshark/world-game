export type Surface = 'day' | 'night'

const BASE = `${import.meta.env.BASE_URL}textures/`

/**
 * Phones and small GPUs get the 4096-wide textures: an 8192 texture needs ~170 MB of GPU memory
 * with mipmaps, enough to crash mobile Safari, and some GPUs cannot load it at all.
 */
export function prefersSmallTextures(maxTextureSize: number): boolean {
  if (maxTextureSize < 8192) return true
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return coarsePointer || (memory !== undefined && memory <= 4)
}

export function textureUrl(surface: Surface, small: boolean): string {
  return `${BASE}${surface === 'night' ? 'night' : 'earth'}${small ? '-4k' : ''}.jpg`
}
