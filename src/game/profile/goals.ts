import { REGIONS, type Region } from '../../geo/countries'
import type { GeoData } from '../../geo/facts'
import { countByMastery, explorerRank, masteryOf } from './mastery'
import type { Profile } from './profile'
import { levelForXp, xpForLevel } from './xp'

export type Goal =
  | { kind: 'region'; region: Region; left: number }
  | { kind: 'rank'; title: string; left: number }
  | { kind: 'level'; level: number; xpLeft: number }

/** Goals this close are worth pointing out before the next level. */
const NEAR = 8

/**
 * The most reachable next step, to give each session a purpose: finishing a region, the next
 * explorer rank, or failing those, the next level.
 */
export function nextGoal(profile: Profile, geo: GeoData): Goal {
  const regionGoals = REGIONS.map((region) => {
    const ids = geo.playableIds.filter((id) => geo.feature(id).properties.region === region)
    const left = ids.filter((id) => {
      const mastery = masteryOf(profile.countries[id])
      return mastery !== 'found' && mastery !== 'mastered'
    }).length
    return { region, left, started: left < ids.length }
  }).filter((goal) => goal.started && goal.left > 0)
  const region = regionGoals.sort((a, b) => a.left - b.left)[0]
  if (region && region.left <= NEAR)
    return { kind: 'region', region: region.region, left: region.left }

  const { mastered } = countByMastery(profile, geo.playableIds)
  const rank = explorerRank(mastered)
  if (rank.next && rank.next.at - mastered <= NEAR) {
    return { kind: 'rank', title: rank.next.title, left: rank.next.at - mastered }
  }

  const level = levelForXp(profile.xp) + 1
  return { kind: 'level', level, xpLeft: xpForLevel(level) - profile.xp }
}
