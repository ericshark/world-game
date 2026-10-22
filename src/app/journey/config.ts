import { EXPEDITIONS } from '../../game/modes/expeditions'
import { DEFAULT_JOURNEY_CONFIG, type JourneyConfig } from '../../game/modes/journey'
import { loadSetup, sanitizeRegion } from '../../game/profile/settings'

export function loadJourneyConfig(): JourneyConfig {
  return loadSetup<JourneyConfig>('journey', (saved) => {
    const expedition = EXPEDITIONS.find(
      (e) => saved.kind === 'expedition' && e.id === saved.expeditionId,
    )
    if (expedition) return { kind: 'expedition', expeditionId: expedition.id }
    const region = sanitizeRegion((saved as { region?: unknown }).region, 'World')
    return region === 'Oceania' ? DEFAULT_JOURNEY_CONFIG : { kind: 'quick', region }
  })
}

/** Stars earned on an expedition, from its best score (see journeyScore). */
export function starsForScore(score: number | undefined): number {
  if (score === undefined || score <= 0) return 0
  return score >= 1000 ? 3 : score >= 700 ? 2 : 1
}
