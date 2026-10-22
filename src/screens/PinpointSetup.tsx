import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { REGIONS } from '../geo/countries'
import type { ScoringRegion } from '../geo/scoring'
import { targetPool, weightByDifficulty } from '../game/core/targets'
import {
  pinpointBestKey,
  pinpointSkill,
  ROUNDS_PER_GAME,
  type PinpointConfig,
} from '../game/modes/pinpoint'
import { skillStats } from '../game/profile/profile'
import { loadPinpointConfig, savePinpointConfig } from '../game/profile/settings'
import { Choice, Switch } from '../ui/controls'
import { Sheet } from '../ui/Sheet'
import { formatNumber } from './format'

const REGION_OPTIONS: ScoringRegion[] = ['World', ...REGIONS]

interface PinpointSetupProps {
  onClose: () => void
  onPlay: (config: PinpointConfig) => void
}

export function PinpointSetup({ onClose, onPlay }: PinpointSetupProps) {
  const { geo, profile } = useApp()
  const [config, setConfig] = useState(loadPinpointConfig)
  const update = (patch: Partial<PinpointConfig>) => setConfig((c) => ({ ...c, ...patch }))

  const pool = targetPool(geo.countries.features, config).map((f) => f.properties.id)
  const poolSize = weightByDifficulty(pool, config.difficulty, geo).length
  const rounds = Math.min(ROUNDS_PER_GAME, poolSize)
  const hasStats = Object.keys(skillStats(profile, pinpointSkill(config))).length > 0
  const best = profile.bests[pinpointBestKey(config)]

  const play = () => {
    savePinpointConfig(config)
    onPlay(config)
  }

  return (
    <Sheet
      eyebrow="Pinpoint"
      title="Set up your game"
      onClose={onClose}
      footer={
        <>
          <p className="sheet__note">
            {poolSize} countries in the pool · {rounds} rounds
            {best && ` · Best ${formatNumber(best.score)}`}
          </p>
          <button
            type="button"
            className="button button--primary button--large"
            disabled={rounds === 0}
            onClick={play}
          >
            Play
          </button>
        </>
      }
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
      <Choice
        label="Region"
        layout="chips"
        value={config.region}
        onChange={(region) => update({ region })}
        options={REGION_OPTIONS.map((region) => ({ value: region, label: region }))}
      />
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
    </Sheet>
  )
}
