import type { PinpointConfig } from '../../game/modes/pinpoint'
import { subPackMeta } from '../../geo/subdivisions'

const DIFFICULTY_LABEL = { easy: 'Easy', normal: 'Normal', hard: 'Hard' }

/** "Capitals · Europe · Hard · Night". */
export function describeConfig(config: PinpointConfig): string {
  if (config.target === 'subdivisions') {
    const meta = subPackMeta(config.subPack ?? 'USA')
    return [
      config.variant === 'name' ? `Name It (${meta.name})` : `${meta.name} ${meta.unitLabel}`,
      DIFFICULTY_LABEL[config.difficulty],
      config.night && 'Night',
      config.practiceWeak && 'Practice',
    ]
      .filter(Boolean)
      .join(' · ')
  }
  const kind =
    config.target === 'flags'
      ? config.variant === 'name'
        ? 'Pick the flag'
        : 'Flags'
      : config.variant === 'name'
        ? 'Name It'
        : config.target === 'capitals'
          ? 'Capitals'
          : config.target === 'cities'
            ? 'Cities'
            : 'Countries'
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
