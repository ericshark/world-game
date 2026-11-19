import { useState } from 'react'
import { targetPool, weightByDifficulty, weightCitiesByDifficulty } from '../../game/core/targets'
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
import { useCities } from '../useCities'

interface PinpointSetupProps {
  onClose: () => void
  onPlay: () => void
}

export function PinpointSetup({ onClose, onPlay }: PinpointSetupProps) {
  const { geo, profile } = useApp()
  const [config, setConfig] = useState(loadPinpointConfig)
  const update = (patch: Partial<PinpointConfig>) => setConfig((c) => ({ ...c, ...patch }))

  const effectiveTarget =
    config.variant === 'name' && (config.target === 'capitals' || config.target === 'cities')
      ? 'countries'
      : config.target
  const activeConfig =
    effectiveTarget === config.target ? config : { ...config, target: effectiveTarget }
  const isCities = effectiveTarget === 'cities'

  const { cities, error: citiesError, retry: retryCities } = useCities(isCities)

  let poolSize = 0
  let note = 'Loading cities…'
  if (isCities) {
    if (cities) {
      poolSize = weightCitiesByDifficulty(
        cities.inRegion(geo, activeConfig.region),
        activeConfig.difficulty,
      ).length
      const rounds = Math.min(ROUNDS_PER_GAME, poolSize)
      note = `${poolSize} cities in the pool · ${rounds} rounds`
    } else if (citiesError) {
      note = 'Could not load major cities'
    }
  } else {
    const pool = targetPool(geo.countries.features, activeConfig).map((f) => f.properties.id)
    poolSize = weightByDifficulty(pool, activeConfig.difficulty, geo).length
    const rounds = Math.min(ROUNDS_PER_GAME, poolSize)
    note = `${poolSize} countries in the pool · ${rounds} rounds`
  }

  const rounds = Math.min(ROUNDS_PER_GAME, poolSize)
  const canPlay = isCities ? cities !== null && rounds > 0 : rounds > 0
  const hasStats = Object.keys(skillStats(profile, pinpointSkill(activeConfig))).length > 0

  return (
    <SetupSheet
      mode="Pinpoint"
      note={note}
      best={profile.bests[pinpointBestKey(activeConfig)]?.score}
      canPlay={canPlay}
      onClose={onClose}
      onPlay={() => {
        savePinpointConfig(activeConfig)
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
      <Choice
        label="Targets"
        value={effectiveTarget}
        onChange={(target) => update({ target })}
        options={[
          { value: 'countries', label: 'Countries' },
          ...(config.variant === 'find'
            ? [
                {
                  value: 'capitals' as const,
                  label: 'Capitals',
                  hint: 'Cities are points: get within 25 km.',
                },
                {
                  value: 'cities' as const,
                  label: 'Cities',
                  hint: 'Major non-capital cities: get within 25 km.',
                },
              ]
            : []),
          {
            value: 'flags',
            label: 'Flags',
            hint:
              config.variant === 'find'
                ? 'We show a flag, you find its country on the globe.'
                : 'We highlight a country, you pick its flag.',
          },
        ]}
      />
      {isCities && citiesError && (
        <p className="error" role="alert">
          Could not load major cities.{' '}
          <button type="button" className="button button--link" onClick={retryCities}>
            Try again
          </button>
        </p>
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
            hint: isCities
              ? 'Famous cities, generous scoring.'
              : config.variant === 'name' && effectiveTarget !== 'flags'
                ? 'Well-known countries, multiple choice.'
                : 'Well-known countries, generous scoring.',
          },
          {
            value: 'normal',
            label: 'Normal',
            hint: isCities ? 'Every city, standard scoring.' : 'Every country, standard scoring.',
          },
          {
            value: 'hard',
            label: 'Hard',
            hint: isCities
              ? 'Lesser-known cities come up more, stricter scoring, 20 seconds a round.'
              : 'Obscure countries come up more, stricter scoring, 20 seconds a round.',
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
        {!isCities && (
          <Switch
            label="Skip micro-states"
            description="Tiny countries like Monaco, Nauru and Grenada"
            checked={config.skipMicro}
            onChange={(skipMicro) => update({ skipMicro })}
          />
        )}
        <Switch
          label={isCities ? 'Practise my weak cities' : 'Practise my weak countries'}
          description={
            hasStats
              ? isCities
                ? 'Cities you often miss come up more'
                : 'Countries you often miss come up more'
              : 'Play a game first so there is something to practise'
          }
          checked={config.practiceWeak}
          onChange={(practiceWeak) => update({ practiceWeak })}
        />
      </div>
    </SetupSheet>
  )
}
