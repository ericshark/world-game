import type { PinpointConfig } from '../../game/modes/pinpoint'

const DIFFICULTY_LABEL = { easy: 'Easy', normal: 'Normal', hard: 'Hard' }

/** "Capitals · Europe · Hard · Night". */
export function describeConfig(config: PinpointConfig): string {
  const kind =
    config.variant === 'name' ? 'Name It' : config.target === 'capitals' ? 'Capitals' : 'Countries'
  return [
    kind,
    config.region,
    DIFFICULTY_LABEL[config.difficulty],
    config.night && 'Night',
    config.practiceWeak && 'Practice',
  ]
    .filter(Boolean)
    .join(' · ')
}
