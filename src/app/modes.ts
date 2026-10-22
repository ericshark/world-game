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
  {
    key: 'rare-earth',
    title: 'Rare Earth',
    tagline: 'Name the country nobody else would, then find it.',
    icon: 'gem',
    accent: '#b98aff',
    howTo: [
      {
        icon: 'gem',
        title: 'Think of a rare answer',
        text: 'Each round asks for a country that fits a category, like “a landlocked country in Africa”. Obvious answers score 100; obscure ones up to 1,000.',
      },
      {
        icon: 'pin',
        title: 'Then find it',
        text: 'Place your country on the globe. Placing it well keeps the full rarity score; a bad placement still keeps a quarter.',
      },
      {
        icon: 'check',
        title: 'Every answer once',
        text: 'A wrong or repeated answer scores nothing. At the reveal, every valid answer lights up in its rarity colour.',
      },
    ],
  },
  {
    key: 'mystery',
    title: 'Mystery Country',
    tagline: 'Hot or cold? Close in on a hidden country.',
    icon: 'search',
    accent: '#ff6a2b',
    howTo: [
      {
        icon: 'search',
        title: 'Guess any country',
        text: 'Type a name or tap a country on the globe. There is one hidden country to find.',
      },
      {
        icon: 'flame',
        title: 'Follow the heat',
        text: 'Each guess shows its distance (border to border) and an arrow pointing the way, and lights up from cold blue to burning red.',
      },
      {
        icon: 'trophy',
        title: 'Fewer guesses, more points',
        text: 'Find it first time for 1,000; each extra guess costs 100. After 6 guesses you can reveal the continent for 2 guesses.',
      },
    ],
  },
  {
    key: 'journey',
    title: 'World Journey',
    tagline: 'Cross the world one border at a time.',
    icon: 'compass',
    accent: '#5aa9ff',
    howTo: [
      {
        icon: 'compass',
        title: 'Plan your route',
        text: 'Travel from the start country to the gold destination through the countries in between.',
      },
      {
        icon: 'pin',
        title: 'Every move is a find',
        text: 'Tap the next country on the borderless globe and press Go. Crossing a border costs 1 step; a short sea crossing costs 2.',
      },
      {
        icon: 'close',
        title: 'Mind the borders',
        text: 'Tapping a country you are not connected to is a misstep (+1). “Show connections” outlines your options for +1.',
      },
      {
        icon: 'trophy',
        title: 'Beat par',
        text: 'Match the best route for 3 stars and 1,000 points. Expeditions add twists like avoiding countries or visiting waypoints.',
      },
    ],
  },
]

export function modeInfo(key: ModeKey): ModeInfo {
  return MODES.find((mode) => mode.key === key)!
}
