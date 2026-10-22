import { useState } from 'react'
import type { RoundResult } from '../../game/core/types'
import {
  DIFFICULTY_RULES,
  pinpoint,
  pinpointSkill,
  type PinpointConfig,
} from '../../game/modes/pinpoint'
import { skillStats } from '../../game/profile/profile'
import type { Units } from '../../game/profile/settings'
import { formatDistance } from '../../screens/format'
import { useApp } from '../AppContext'
import { modeInfo } from '../modes'
import { RoundGame } from '../rounds/RoundGame'
import { bestStreak } from '../streaks'
import { describeConfig } from './describe'

interface PinpointGameProps {
  config: PinpointConfig
  seed?: string
  onChangeSetup: () => void
  onHome: () => void
}

export function PinpointGame({ config, ...props }: PinpointGameProps) {
  const { profile } = useApp()
  // Practice weights come from the stats at the start of the game.
  const [stats] = useState(() => skillStats(profile, pinpointSkill(config)))
  return (
    <RoundGame
      {...props}
      rules={pinpoint}
      config={config}
      mode="Pinpoint"
      subtitle={describeConfig(config)}
      introKey="pinpoint"
      howTo={modeInfo('pinpoint').howTo}
      night={config.night}
      roundTimeMs={DIFFICULTY_RULES[config.difficulty].roundTimeMs}
      suggestions={config.difficulty !== 'hard'}
      hideCapitalCountry={config.difficulty === 'hard'}
      stats={stats}
      tiles={pinpointTiles}
    />
  )
}

function pinpointTiles(results: RoundResult[], units: Units) {
  const pinned = results.flatMap((r) => (r.kind === 'locate' || r.kind === 'capital' ? [r] : []))
  const averageKm = pinned.reduce((sum, r) => sum + r.distanceKm, 0) / Math.max(1, pinned.length)
  return [
    { label: 'Correct', value: `${results.filter((r) => r.hit).length} / ${results.length}` },
    { label: 'Best streak', value: String(bestStreak(results)) },
    pinned.length > 0
      ? { label: 'Average distance', value: formatDistance(averageKm, units) }
      : {
          label: 'Hints used',
          value: String(results.filter((r) => r.kind === 'identify' && r.hintUsed).length),
        },
  ]
}
