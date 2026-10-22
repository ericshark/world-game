import type { CountrySkills, Profile } from './profile'

/** How well the player knows a country, across every skill and mode. */
export type Mastery = 'unseen' | 'seen' | 'found' | 'mastered'

/** Hits among the most recent attempts that show a country is really known. */
const RECENT_HITS_FOR_MASTERY = 3

/**
 * Seen: asked about. Found: got it right at least once. Mastered: right in at least 3 of the
 * last 4 tries of some skill, or right in two different skills (say, finding and naming it).
 */
export function masteryOf(skills: CountrySkills | undefined): Mastery {
  const tried = Object.values(skills ?? {}).filter((stats) => stats && stats.attempts > 0)
  if (tried.length === 0) return 'unseen'
  const hit = tried.filter((stats) => stats!.hits > 0)
  if (hit.length === 0) return 'seen'
  const steady = tried.some(
    (stats) => stats!.recent.filter(Boolean).length >= RECENT_HITS_FOR_MASTERY,
  )
  return steady || hit.length >= 2 ? 'mastered' : 'found'
}

export function countByMastery(profile: Profile, ids: readonly string[]): Record<Mastery, number> {
  const counts: Record<Mastery, number> = { unseen: 0, seen: 0, found: 0, mastered: 0 }
  for (const id of ids) counts[masteryOf(profile.countries[id])]++
  return counts
}

/** Countries at least found. */
export function foundCount(profile: Profile, ids: readonly string[]): number {
  const counts = countByMastery(profile, ids)
  return counts.found + counts.mastered
}

const RANKS: { mastered: number; title: string }[] = [
  { mastered: 0, title: 'Newcomer' },
  { mastered: 10, title: 'Wanderer' },
  { mastered: 30, title: 'Traveller' },
  { mastered: 60, title: 'Explorer' },
  { mastered: 100, title: 'Navigator' },
  { mastered: 150, title: 'Cartographer' },
  { mastered: 197, title: 'Atlas' },
]

/** A title earned by knowledge, not grinding: it only grows with mastered countries. */
export function explorerRank(mastered: number): {
  title: string
  next: { title: string; at: number } | null
} {
  const index = RANKS.findLastIndex((rank) => mastered >= rank.mastered)
  const next = RANKS[index + 1]
  return { title: RANKS[index].title, next: next ? { title: next.title, at: next.mastered } : null }
}
