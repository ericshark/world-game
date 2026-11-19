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
import { Sheet } from '../../ui/Sheet'
import { useApp } from '../AppContext'
import { modeInfo } from '../modes'
import { RoundGame } from '../rounds/RoundGame'
import { bestStreak } from '../streaks'
import { useCities } from '../useCities'
import { describeConfig } from './describe'

interface PinpointGameProps {
  config: PinpointConfig
  seed?: string
  onChangeSetup: () => void
  onHome: () => void
}

export function PinpointGame({ config, ...props }: PinpointGameProps) {
  const { profile } = useApp()
  const needsCities = config.target === 'cities' && config.variant !== 'name'
  const { cities, error, retry } = useCities(needsCities)
  // Practice weights come from the stats at the start of the game.
  const [stats] = useState(() => skillStats(profile, pinpointSkill(config)))

  if (needsCities && error) {
    return (
      <Sheet
        title="Could not load major cities"
        onClose={props.onHome}
        footer={
          <button type="button" className="button button--primary" onClick={retry}>
            Try again
          </button>
        }
      >
        <p className="error" role="alert">
          Check your connection and try again.
        </p>
      </Sheet>
    )
  }

  if (needsCities && !cities) {
    return (
      <div className="screen screen--center">
        <p className="panel waiting">Loading cities…</p>
      </div>
    )
  }

  return (
    <RoundGame
      {...props}
      rules={pinpoint}
      config={config}
      cities={cities ?? undefined}
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
  const pinned = results.flatMap((r) =>
    r.kind === 'locate' || r.kind === 'capital' || r.kind === 'city' ? [r] : [],
  )
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
