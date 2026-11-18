import { REGIONS } from '../../geo/countries'
import type { GeoData } from '../../geo/facts'
import type { CountryOutcome, SessionSummary } from '../core/types'
import { newAchievements, type Achievement } from './achievements'
import { masteryOf } from './mastery'
import type { DailyRecord, Profile } from './profile'
import { recordAttempt } from './stats'
import { completeGoals, type WeeklyGoal } from './weekly'
import { levelForXp, sessionXp, XP_PER_ACHIEVEMENT } from './xp'

export { HISTORY_LIMIT } from './sanitize'
import { HISTORY_LIMIT, MAX_CONFUSIONS } from './sanitize'

/**
 * Adds a revealed round's outcomes to the per-country stats. Done round by round, so a game the
 * player quits early still counts for practice. Countries mastered for the first time are
 * stamped, so the results screen can celebrate them.
 */
export function recordOutcomes(profile: Profile, outcomes: CountryOutcome[], at: number): Profile {
  const countries = { ...profile.countries }
  const masteredAt = { ...profile.masteredAt }
  const confusions = { ...profile.confusions }
  for (const { countryId, skill, success, distanceKm, mistakenFor } of outcomes) {
    if (mistakenFor)
      confusions[`${countryId}>${mistakenFor}`] =
        (confusions[`${countryId}>${mistakenFor}`] ?? 0) + 1
    const skills = { ...countries[countryId] }
    skills[skill] = recordAttempt(skills[skill], success, distanceKm, at)
    countries[countryId] = skills
    if (!(countryId in masteredAt) && masteryOf(skills) === 'mastered') masteredAt[countryId] = at
  }
  return { ...profile, countries, masteredAt, confusions: capConfusions(confusions) }
}

export interface RecordedSession {
  profile: Profile
  /** The best score for this kind of game before this one, if any. */
  previousBest: number | null
  isPersonalBest: boolean
  xpGained: number
  levelBefore: number
  levelAfter: number
  achievements: Achievement[]
  /** Countries first mastered during this game. */
  newlyMastered: string[]
  /** Weekly goals this game completed (their XP is already in `xpGained`). */
  goals: WeeklyGoal[]
}

/**
 * Adds a finished game to the history, personal bests and daily record, then awards
 * achievements and XP for it.
 */
export function recordSession(
  profile: Profile,
  summary: SessionSummary,
  geo: GeoData,
): RecordedSession {
  const previousBest = profile.bests[summary.bestKey]?.score ?? null
  const isPersonalBest = previousBest === null || summary.score > previousBest
  const bests = isPersonalBest
    ? { ...profile.bests, [summary.bestKey]: { score: summary.score, at: summary.endedAt } }
    : profile.bests
  const entry = {
    mode: summary.mode,
    bestKey: summary.bestKey,
    score: summary.score,
    maxScore: summary.maxScore,
    endedAt: summary.endedAt,
    metrics: summary.metrics,
  }
  const history = [...profile.history, entry].slice(-HISTORY_LIMIT)
  let next: Profile = { ...profile, bests, history, daily: withDaily(profile, summary) }

  const newlyMastered = Object.entries(next.masteredAt)
    .filter(([, at]) => at >= summary.startedAt)
    .map(([id]) => id)
  const levelBefore = levelForXp(profile.xp)
  const baseXp = sessionXp(summary, { newlyMastered: newlyMastered.length, achievements: 0 })
  next = { ...next, xp: next.xp + baseXp }

  // Achievements are checked against the updated profile; their XP can unlock "reach level"
  // achievements in turn, so a second pass catches those.
  const unlocked: Achievement[] = []
  for (let pass = 0; pass < 2; pass++) {
    const earned = newAchievements({ profile: next, summary, geo })
    if (earned.length === 0) break
    unlocked.push(...earned)
    next = {
      ...next,
      xp: next.xp + XP_PER_ACHIEVEMENT * earned.length,
      achievements: {
        ...next.achievements,
        ...Object.fromEntries(earned.map((a) => [a.id, summary.endedAt])),
      },
    }
  }

  next = withCertificate(next, summary)

  const weekly = completeGoals(next, geo, summary.endedAt)
  next = weekly.profile

  return {
    profile: next,
    previousBest,
    isPersonalBest,
    xpGained: next.xp - profile.xp,
    levelBefore,
    levelAfter: levelForXp(next.xp),
    achievements: unlocked,
    newlyMastered,
    goals: weekly.completed,
  }
}

function withDaily(profile: Profile, summary: SessionSummary): Profile['daily'] {
  if (!summary.daily) return profile.daily
  const { dateKey, puzzle } = summary.daily
  const day: DailyRecord = { ...profile.daily[dateKey] }
  // One attempt per puzzle per day: the first result stands.
  if (day[puzzle]) return profile.daily
  const m = summary.metrics
  if (puzzle === 'five') {
    day.five = { score: summary.score, tones: decodeTones(m) }
  } else if (puzzle === 'mystery') {
    day.mystery = { score: summary.score, guesses: m.guesses ?? 0, solved: m.solved === 1 }
  } else {
    day.route = { score: summary.score, stars: m.stars ?? 0 }
  }
  return { ...profile.daily, [dateKey]: day }
}

/** Daily Five round tones are passed as metrics tone0…tone4 (0 miss … 4 perfect). */
export const TONE_NAMES = ['miss', 'close', 'good', 'great', 'perfect']
function decodeTones(metrics: Record<string, number>): string[] {
  return Object.keys(metrics)
    .filter((key) => /^tone\d+$/.test(key))
    .sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)))
    .map((key) => TONE_NAMES[metrics[key]] ?? 'miss')
}

/** Keeps the most frequent mix-ups when the table grows past its cap. */
function capConfusions(confusions: Record<string, number>): Record<string, number> {
  const entries = Object.entries(confusions)
  if (entries.length <= MAX_CONFUSIONS) return confusions
  return Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_CONFUSIONS))
}

/** A passed regional exam (see learn.ts) earns that region's certificate, once. */
function withCertificate(profile: Profile, summary: SessionSummary): Profile {
  if (summary.mode !== 'learn' || summary.metrics.examPassed !== 1) return profile
  const region = REGIONS[summary.metrics.examRegion]
  if (!region || region in profile.certificates) return profile
  return { ...profile, certificates: { ...profile.certificates, [region]: summary.endedAt } }
}
