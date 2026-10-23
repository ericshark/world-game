import { REGIONS } from '../../geo/countries'
import type { GeoData } from '../../geo/facts'
import { createRandom, shuffled, randomInt } from '../core/random'
import { dateKeyAfter, localDateKey } from './daily'
import type { Profile } from './profile'

/** What a weekly goal counts. */
export type GoalMeasure =
  /** Finished games. */
  | { kind: 'games' }
  /** Different kinds of game finished. */
  | { kind: 'modes' }
  /** Daily puzzles finished (each of the three counts). */
  | { kind: 'dailies' }
  /** Countries mastered for the first time, anywhere or in one region. */
  | { kind: 'mastered'; region?: string }
  /** Games finished with at least four fifths of the points. */
  | { kind: 'strong' }

export interface WeeklyGoal {
  /** Unique within the week; stored once the goal is done. */
  id: string
  text: string
  measure: GoalMeasure
  target: number
  xp: number
}

export const WEEKLY_GOAL_COUNT = 3
/** A game counts as strong from this share of its possible points. */
const STRONG_SHARE = 0.8
/** Old weeks' records are dropped after this many. */
export const WEEKS_KEPT = 12

/** The Monday of the (local) week a date falls in, as a date key. */
export function weekKey(dateKey: string): string {
  const weekday = new Date(`${dateKey}T12:00:00Z`).getUTCDay()
  let day = dateKey
  for (let back = (weekday + 6) % 7; back > 0; back--) {
    day = new Date(Date.parse(`${day}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  }
  return day
}

interface Template {
  kind: GoalMeasure['kind']
  make(random: () => number): Omit<WeeklyGoal, 'id'>
}

const pick = <T>(random: () => number, options: T[]): T =>
  options[randomInt(random, options.length)]

const TEMPLATES: Template[] = [
  {
    kind: 'games',
    make: (random) => {
      const target = pick(random, [4, 6, 8])
      return {
        text: `Finish ${target} games`,
        measure: { kind: 'games' },
        target,
        xp: 60 + target * 10,
      }
    },
  },
  {
    kind: 'modes',
    make: (random) => {
      const target = pick(random, [3, 4])
      return {
        text: `Play ${target} different modes`,
        measure: { kind: 'modes' },
        target,
        xp: 80 + target * 20,
      }
    },
  },
  {
    kind: 'dailies',
    make: (random) => {
      const target = pick(random, [3, 4, 5])
      return {
        text: `Finish ${target} daily puzzles`,
        measure: { kind: 'dailies' },
        target,
        xp: 50 + target * 30,
      }
    },
  },
  {
    kind: 'mastered',
    make: (random) => {
      const region = random() < 0.5 ? undefined : pick(random, [...REGIONS])
      const target = region ? 2 : pick(random, [2, 3])
      return {
        text: region ? `Master ${target} countries in ${region}` : `Master ${target} new countries`,
        measure: { kind: 'mastered', ...(region && { region }) },
        target,
        xp: 150 + target * 25,
      }
    },
  },
  {
    kind: 'strong',
    make: (random) => {
      const target = pick(random, [1, 2])
      return {
        text:
          target === 1
            ? 'Finish a game with 80% of the points or more'
            : 'Finish 2 games with 80% of the points or more',
        measure: { kind: 'strong' },
        target,
        xp: 100 + target * 40,
      }
    },
  },
]

/**
 * Three goals for the week starting on `week`, the same for every player: different kinds, with
 * targets drawn from the week's own seed.
 */
export function weeklyGoals(week: string): WeeklyGoal[] {
  const random = createRandom(`weekly:${week}`)
  return shuffled(TEMPLATES, random)
    .slice(0, WEEKLY_GOAL_COUNT)
    .map((template) => {
      const goal = template.make(random)
      return {
        id: `${week}:${template.kind}${'region' in goal.measure ? `:${goal.measure.region}` : ''}`,
        ...goal,
      }
    })
}

function weekBounds(week: string): { from: number; until: number } {
  const local = (key: string) => {
    const [y, m, d] = key.split('-').map(Number)
    return new Date(y, m - 1, d).getTime()
  }
  let end = week
  for (let i = 0; i < 7; i++) end = dateKeyAfter(end)
  return { from: local(week), until: local(end) }
}

/** How far a goal has got for this week, from the history, masteries and daily record. */
export function goalProgress(
  goal: WeeklyGoal,
  week: string,
  profile: Profile,
  geo: GeoData,
): number {
  const { from, until } = weekBounds(week)
  const inWeek = (at: number) => at >= from && at < until
  const games = profile.history.filter((entry) => inWeek(entry.endedAt))
  switch (goal.measure.kind) {
    case 'games':
      return games.length
    case 'modes':
      return new Set(games.map((entry) => entry.mode)).size
    case 'dailies': {
      let done = 0
      for (let day = week, i = 0; i < 7; day = dateKeyAfter(day), i++) {
        const record = profile.daily[day]
        done += record
          ? Number(Boolean(record.five)) +
            Number(Boolean(record.mystery)) +
            Number(Boolean(record.route))
          : 0
      }
      return done
    }
    case 'mastered': {
      const { region } = goal.measure
      return Object.entries(profile.masteredAt).filter(
        ([id, at]) =>
          inWeek(at) &&
          (!region ||
            (geo.playableIds.includes(id) && geo.feature(id).properties.region === region)),
      ).length
    }
    case 'strong':
      return games.filter(
        (entry) =>
          entry.maxScore !== null &&
          entry.maxScore > 0 &&
          entry.score / entry.maxScore >= STRONG_SHARE,
      ).length
  }
}

/** The week's goals with their progress, for showing. */
export function weekStatus(profile: Profile, geo: GeoData, now: number) {
  const week = weekKey(localDateKey(now))
  const done = new Set(profile.weeklyDone[week] ?? [])
  return weeklyGoals(week).map((goal) => {
    const progress = Math.min(goal.target, goalProgress(goal, week, profile, geo))
    return { goal, progress, done: done.has(goal.id) || progress >= goal.target }
  })
}

/**
 * Marks this week's finished goals as done and returns them with the profile that remembers
 * it. Each is paid out once, however many games push it past its target.
 */
export function completeGoals(
  profile: Profile,
  geo: GeoData,
  at: number,
): { profile: Profile; completed: WeeklyGoal[] } {
  const week = weekKey(localDateKey(at))
  const already = new Set(profile.weeklyDone[week] ?? [])
  const completed = weeklyGoals(week).filter(
    (goal) => !already.has(goal.id) && goalProgress(goal, week, profile, geo) >= goal.target,
  )
  if (completed.length === 0) return { profile, completed }
  const weeklyDone = { ...profile.weeklyDone, [week]: [...already, ...completed.map((g) => g.id)] }
  const recent = Object.keys(weeklyDone).sort().slice(-WEEKS_KEPT)
  return {
    profile: {
      ...profile,
      xp: profile.xp + completed.reduce((sum, goal) => sum + goal.xp, 0),
      weeklyDone: Object.fromEntries(recent.map((key) => [key, weeklyDone[key]])),
    },
    completed,
  }
}
