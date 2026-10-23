import { englishDataset, englishRecommendedTransformers, RegExpMatcher } from 'obscenity'
import { cleanName } from '../../src/net/protocol'

export const NICKNAME_MIN = 2
export const NICKNAME_MAX = 20

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers })

export type NicknameCheck = { ok: true; name: string } | { ok: false; reason: string }

/** Cleans a typed nickname and checks its length and language. */
export function checkNickname(raw: unknown): NicknameCheck {
  if (typeof raw !== 'string') return { ok: false, reason: 'Pick a nickname.' }
  const name = cleanName(raw)
  const length = Array.from(name).length
  if (length < NICKNAME_MIN || length > NICKNAME_MAX) {
    return { ok: false, reason: `Nicknames are ${NICKNAME_MIN}–${NICKNAME_MAX} characters.` }
  }
  // "#" is reserved for the number added to duplicate names.
  if (name.includes('#')) return { ok: false, reason: 'Nicknames cannot contain “#”.' }
  if (matcher.hasMatch(name)) return { ok: false, reason: 'Please choose a different nickname.' }
  return { ok: true, name }
}
