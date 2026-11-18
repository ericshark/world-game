import type { RoundResult } from './types'

/**
 * The country a player took for the target: where their pin landed (when it was another
 * country), or the answer they named. Used to learn which pairs a player mixes up.
 */
export function mistakenFor(result: RoundResult): string | undefined {
  if (result.hit) return undefined
  if (result.kind === 'locate' || result.kind === 'capital') {
    return result.clickedId && result.clickedId !== result.targetId ? result.clickedId : undefined
  }
  if (result.kind === 'identify') {
    return result.answerId !== result.targetId ? result.answerId : undefined
  }
  return undefined
}
