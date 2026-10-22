import { REGIONS } from '../../geo/countries'
import type { GeoData } from '../../geo/facts'
import type { SessionSummary } from '../core/types'
import { EXPEDITIONS } from '../modes/expeditions'
import { dailyStreak } from './daily'
import { masteryOf } from './mastery'
import type { Profile } from './profile'
import { levelForXp } from './xp'

export type AchievementGroup =
  | 'Exploration'
  | 'Precision'
  | 'Speed'
  | 'Knowledge'
  | 'Mystery'
  | 'Journeys'
  | 'Daily'
  | 'Battle'
  | 'Progress'

interface Context {
  /** The profile with this game already recorded. */
  profile: Profile
  /** The game just finished. */
  summary: SessionSummary
  geo: GeoData
}

export interface Achievement {
  id: string
  title: string
  description: string
  group: AchievementGroup
  check: (context: Context) => boolean
}

const metric = (summary: SessionSummary, name: string) => summary.metrics[name] ?? 0
const isMode = (summary: SessionSummary, mode: SessionSummary['mode']) => summary.mode === mode
const found = ({ profile }: Context, id: string) => {
  const mastery = masteryOf(profile.countries[id])
  return mastery === 'found' || mastery === 'mastered'
}

/** Every achievement. Checks are pure, so they can be re-run over a whole history later. */
export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-steps',
    title: 'First steps',
    description: 'Finish your first game.',
    group: 'Exploration',
    check: () => true,
  },
  ...REGIONS.map((region): Achievement => ({
    id: `continent-${region.toLowerCase().replace(' ', '-')}`,
    title: `${region} complete`,
    description: `Find every country in ${region}.`,
    group: 'Exploration',
    check: (context) =>
      context.geo.playableIds
        .filter((id) => context.geo.feature(id).properties.region === region)
        .every((id) => found(context, id)),
  })),
  {
    id: 'globetrotter',
    title: 'Globetrotter',
    description: 'Find 100 different countries.',
    group: 'Exploration',
    check: (context) => context.geo.playableIds.filter((id) => found(context, id)).length >= 100,
  },
  {
    id: 'whole-world',
    title: 'The whole world',
    description: 'Find all 197 countries.',
    group: 'Exploration',
    check: (context) => context.geo.playableIds.every((id) => found(context, id)),
  },
  {
    id: 'perfect-ten',
    title: 'Perfect ten',
    description: 'Score 10,000 in a Pinpoint game.',
    group: 'Precision',
    check: ({ summary }) => isMode(summary, 'pinpoint') && summary.score === summary.maxScore,
  },
  {
    id: 'micro-master',
    title: 'Micro master',
    description: 'Find a micro-state in Pinpoint.',
    group: 'Precision',
    check: ({ summary, geo }) =>
      isMode(summary, 'pinpoint') &&
      summary.outcomes.some(
        (o) => o.skill === 'locate' && o.success && geo.feature(o.countryId).properties.isMicro,
      ),
  },
  {
    id: 'capital-gains',
    title: 'Capital gains',
    description: 'Score 9,000 or more in a Capitals game.',
    group: 'Precision',
    check: ({ summary }) =>
      summary.bestKey.startsWith('pinpoint:capitals') && summary.score >= 9000,
  },
  {
    id: 'night-owl',
    title: 'Night owl',
    description: 'Score 7,000 or more on the Night Earth globe.',
    group: 'Precision',
    check: ({ summary }) => summary.bestKey.includes(':night') && summary.score >= 7000,
  },
  {
    id: 'name-dropper',
    title: 'Name dropper',
    description: 'Name all 10 countries in a Name It game.',
    group: 'Knowledge',
    check: ({ summary }) =>
      summary.bestKey.startsWith('pinpoint:name') && metric(summary, 'hits') === 10,
  },
  {
    id: 'rush-20',
    title: 'Rush hour',
    description: 'Find 20 countries in one GeoRush.',
    group: 'Speed',
    check: ({ summary }) => isMode(summary, 'rush') && metric(summary, 'found') >= 20,
  },
  {
    id: 'rush-streak',
    title: 'On fire',
    description: 'Reach the ×5 multiplier (a streak of 15) in GeoRush.',
    group: 'Speed',
    check: ({ summary }) => isMode(summary, 'rush') && metric(summary, 'bestStreak') >= 15,
  },
  {
    id: 'sudden-10',
    title: 'Nerves of steel',
    description: 'Find 10 countries in a Sudden Death GeoRush.',
    group: 'Speed',
    check: ({ summary }) =>
      isMode(summary, 'rush') &&
      metric(summary, 'suddenDeath') === 1 &&
      metric(summary, 'found') >= 10,
  },
  {
    id: 'legendary',
    title: 'Legendary',
    description: 'Give a Legendary answer in Rare Earth.',
    group: 'Knowledge',
    check: ({ summary }) => isMode(summary, 'rare-earth') && metric(summary, 'legendary') >= 1,
  },
  {
    id: 'clean-sweep',
    title: 'Clean sweep',
    description: 'Give five valid answers in a Rare Earth game.',
    group: 'Knowledge',
    check: ({ summary }) => isMode(summary, 'rare-earth') && metric(summary, 'valid') === 5,
  },
  {
    id: 'rare-4000',
    title: 'Off the beaten track',
    description: 'Score 4,000 or more in Rare Earth.',
    group: 'Knowledge',
    check: ({ summary }) => isMode(summary, 'rare-earth') && summary.score >= 4000,
  },
  {
    id: 'mystery-3',
    title: 'Detective',
    description: 'Solve a Mystery Country in three guesses or fewer.',
    group: 'Mystery',
    check: ({ summary }) =>
      isMode(summary, 'mystery') &&
      metric(summary, 'solved') === 1 &&
      metric(summary, 'guesses') <= 3,
  },
  {
    id: 'mystery-1',
    title: 'Mind reader',
    description: 'Solve a Mystery Country with your first guess.',
    group: 'Mystery',
    check: ({ summary }) =>
      isMode(summary, 'mystery') &&
      metric(summary, 'solved') === 1 &&
      metric(summary, 'guesses') === 1,
  },
  {
    id: 'par',
    title: 'Navigator',
    description: 'Finish a World Journey at par.',
    group: 'Journeys',
    check: ({ summary }) => isMode(summary, 'journey') && metric(summary, 'stars') === 3,
  },
  {
    id: 'expedition',
    title: 'Expedition leader',
    description: 'Complete an expedition.',
    group: 'Journeys',
    check: ({ summary }) =>
      isMode(summary, 'journey') &&
      metric(summary, 'expedition') === 1 &&
      metric(summary, 'stars') >= 1,
  },
  {
    id: 'all-expeditions',
    title: 'Every road',
    description: 'Earn three stars on every expedition.',
    group: 'Journeys',
    check: ({ profile }) =>
      EXPEDITIONS.every((e) => (profile.bests[`journey:${e.id}`]?.score ?? 0) >= 1000),
  },
  {
    id: 'daily-first',
    title: 'Daily habit',
    description: 'Complete a Daily Five.',
    group: 'Daily',
    check: ({ summary }) => isMode(summary, 'daily'),
  },
  {
    id: 'daily-perfect-day',
    title: 'Perfect day',
    description: 'Finish all three daily puzzles on the same day.',
    group: 'Daily',
    check: ({ profile }) =>
      Object.values(profile.daily).some((day) => day.five && day.mystery && day.route),
  },
  {
    id: 'streak-7',
    title: 'Week streak',
    description: 'Play the Daily Five seven days in a row.',
    group: 'Daily',
    check: ({ profile, summary }) => dailyStreak(profile, summary.endedAt) >= 7,
  },
  {
    id: 'streak-30',
    title: 'Month streak',
    description: 'Play the Daily Five thirty days in a row.',
    group: 'Daily',
    check: ({ profile, summary }) => dailyStreak(profile, summary.endedAt) >= 30,
  },
  {
    id: 'battle-win',
    title: 'Victorious',
    description: 'Win a World Battle.',
    group: 'Battle',
    check: ({ summary }) => isMode(summary, 'battle') && metric(summary, 'won') === 1,
  },
  {
    id: 'battle-flawless',
    title: 'Flawless',
    description: 'Win a Duel without losing any HP.',
    group: 'Battle',
    check: ({ summary }) =>
      isMode(summary, 'battle') &&
      metric(summary, 'won') === 1 &&
      metric(summary, 'flawless') === 1,
  },
  {
    id: 'mastered-50',
    title: 'Fifty mastered',
    description: 'Master 50 countries.',
    group: 'Progress',
    check: ({ profile }) => Object.keys(profile.masteredAt).length >= 50,
  },
  {
    id: 'level-10',
    title: 'Seasoned',
    description: 'Reach level 10.',
    group: 'Progress',
    check: ({ profile }) => levelForXp(profile.xp) >= 10,
  },
]

/** Achievements the game just earned that were not unlocked before. */
export function newAchievements(context: Context): Achievement[] {
  return ACHIEVEMENTS.filter(
    (achievement) =>
      !(achievement.id in context.profile.achievements) && achievement.check(context),
  )
}
