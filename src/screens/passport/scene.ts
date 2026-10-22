import type { Mastery } from '../../game/profile/mastery'
import type { CountryPaint } from '../../globe/scene'

export const MASTERY_STYLE: Record<Exclude<Mastery, 'unseen'>, { label: string; color: string }> = {
  seen: { label: 'Seen', color: '#9aaccb' },
  found: { label: 'Found', color: '#4fd1c5' },
  mastered: { label: 'Mastered', color: '#ffd54a' },
}

export function masteryPaint(id: string, mastery: Exclude<Mastery, 'unseen'>): CountryPaint {
  const { color } = MASTERY_STYLE[mastery]
  const fillAlpha = mastery === 'seen' ? '1a' : mastery === 'found' ? '55' : '77'
  return { id, fill: `${color}${fillAlpha}`, stroke: `${color}cc`, lineWidth: 1.5 }
}
