import { useState } from 'react'
import { targetPool, weightByDifficulty } from '../../game/core/targets'
import {
  pinpointBestKey,
  pinpointSkill,
  ROUNDS_PER_GAME,
  type PinpointConfig,
} from '../../game/modes/pinpoint'
import { skillStats } from '../../game/profile/profile'
import { loadPinpointConfig, savePinpointConfig } from '../../game/profile/settings'
import { Choice, Switch } from '../../ui/controls'
import { RegionChoice, SetupSheet } from '../../ui/SetupSheet'
import { useApp } from '../AppContext'

interface PinpointSetupProps {
  onClose: () => void
  onPlay: () => void
}

export function PinpointSetup({ onClose, onPlay }: PinpointSetupProps) {
  const { geo, profile } = useApp()
  const [config, setConfig] = useState(loadPinpointConfig)
  const update = (patch: Partial<PinpointConfig>) => setConfig((c) => ({ ...c, ...patch }))

  const pool = targetPool(geo.countries.features, config).map((f) => f.properties.id)
  const poolSize = weightByDifficulty(pool, config.difficulty, geo).length
  const rounds = Math.min(ROUNDS_PER_GAME, poolSize)
  const hasStats = Object.keys(skillStats(profile, pinpointSkill(config))).length > 0

  return (
    <SetupSheet
      mode="Pinpoint"
      note={`${poolSize} countries in the pool · ${rounds} rounds`}
      best={profile.bests[pinpointBestKey(config)]?.score}
      canPlay={rounds > 0}
      onClose={onClose}
      onPlay={() => {
        savePinpointConfig(config)
        onPlay()
      }}
    >
      <Choice
        label="Mode"
        value={config.variant}
        onChange={(variant) => update({ variant })}
        options={[
          { value: 'find', label: 'Find it', hint: 'We name a place, you pin it on the globe.' },
          { value: 'name', label: 'Name it', hint: 'We highlight a country, you name it.' },
        ]}
      />
      {config.variant === 'find' && (
        <Choice
          label="Targets"
          value={config.target}
          onChange={(target) => update({ target })}
          options={[
            { value: 'countries', label: 'Countries' },
            { value: 'capitals', label: 'Capitals', hint: 'Cities are points: get within 25 km.' },
          ]}
        />
      )}
      <RegionChoice value={config.region} onChange={(region) => update({ region })} />
      <Choice
        label="Difficulty"
        value={config.difficulty}
        onChange={(difficulty) => update({ difficulty })}
        options={[
          {
            value: 'easy',
            label: 'Easy',
            hint:
              config.variant === 'name'
                ? 'Well-known countries, multiple choice.'
                : 'Well-known countries, generous scoring.',
          },
          { value: 'normal', label: 'Normal', hint: 'Every country, standard scoring.' },
          {
            value: 'hard',
            label: 'Hard',
            hint: 'Obscure countries come up more, stricter scoring, 20 seconds a round.',
          },
        ]}
      />
      <div className="switches">
        <Switch
          label="Night Earth"
          description="Find your way by city lights"
          checked={config.night}
          onChange={(night) => update({ night })}
        />
        <Switch
          label="Skip micro-states"
          description="Tiny countries like Monaco, Nauru and Grenada"
          checked={config.skipMicro}
          onChange={(skipMicro) => update({ skipMicro })}
        />
        <Switch
          label="Practise my weak countries"
          description={
            hasStats
              ? 'Countries you often miss come up more'
              : 'Play a game first so there is something to practise'
          }
          checked={config.practiceWeak}
          onChange={(practiceWeak) => update({ practiceWeak })}
        />
      </div>
    </SetupSheet>
  )
}
