import type { IconName } from '../ui/Icon'
import type { HowToStep } from '../ui/HowToPlay'
import type { ModeKey } from './router'

export interface ModeInfo {
  key: ModeKey
  title: string
  tagline: string
  icon: IconName
  /** Accent colour for the mode's tile. */
  accent: string
  howTo: HowToStep[]
}

export const MODES: ModeInfo[] = [
  {
    key: 'pinpoint',
    title: 'Pinpoint',
    tagline: 'Find countries and capitals on a borderless Earth.',
    icon: 'pin',
    accent: '#ffd54a',
    howTo: [
      {
        icon: 'globe',
        title: 'Spin and zoom',
        text: 'Drag to turn the globe; scroll or pinch to zoom. Arrow keys and +/− work too.',
      },
      {
        icon: 'pin',
        title: 'Drop your pin',
        text: 'Tap where you think the country is. There are no borders, so trust your map sense.',
      },
      {
        icon: 'check',
        title: 'Confirm',
        text: 'Press Confirm (or Enter). Inside the country scores 1,000; the closer you are, the more you keep.',
      },
      {
        icon: 'search',
        title: 'Name It and Capitals',
        text: 'Switch modes in the setup: name a highlighted country, or find capital cities.',
      },
    ],
  },
  {
    key: 'rush',
    title: 'GeoRush',
    tagline: 'As many countries as you can find against the clock.',
    icon: 'bolt',
    accent: '#ff9a4a',
    howTo: [
      {
        icon: 'bolt',
        title: 'One tap answers',
        text: 'No confirming: tap the country and the next one appears straight away.',
      },
      {
        icon: 'calendar',
        title: 'Beat the clock',
        text: 'You start with 60 seconds. Hits add 2 s, misses cost 3 s, skips cost 2 s.',
      },
      {
        icon: 'flame',
        title: 'Build a streak',
        text: 'Consecutive hits multiply your points: ×2 at 3, ×3 at 6, up to ×5 at 15. Near misses keep the streak.',
      },
      {
        icon: 'globe',
        title: 'It gets harder',
        text: 'Famous countries first; every 5 hits the countries get more obscure.',
      },
    ],
  },
]

export function modeInfo(key: ModeKey): ModeInfo {
  return MODES.find((mode) => mode.key === key)!
}
