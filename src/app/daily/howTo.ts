import type { Challenge } from '../../game/core/types'
import type { HowToStep } from '../../ui/HowToPlay'

export const DAILY_HOW_TO: HowToStep[] = [
  {
    icon: 'calendar',
    title: 'One puzzle a day',
    text: 'Everyone gets the same five rounds today. You have one go, so take your time.',
  },
  {
    icon: 'pin',
    title: 'Five kinds of round',
    text: 'Find a country, name one, give a rare answer, find a capital, and a hard final find.',
  },
  {
    icon: 'flame',
    title: 'Keep your streak',
    text: 'Play every day to grow your streak, then share your score without spoilers.',
  },
]

/** The Daily Five mixes kinds of round, so each one says how it works. */
export function dailyRoundTip(challenge: Challenge, round: number): string {
  switch (challenge.kind) {
    case 'locate':
      return round === 0
        ? 'Find it · tap the country, then confirm'
        : 'Finale · a harder one to finish the day'
    case 'identify':
      return 'Name it · type the highlighted country'
    case 'category':
      return 'Think rare · rarer right answers score more, then place yours'
    case 'capital':
      return 'Capital · find the city itself, not just its country'
    case 'city':
      return 'City · find the city itself, not just its country'
  }
}
