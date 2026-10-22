import { useState } from 'react'
import { REGIONS } from '../../geo/countries'
import { EXPEDITIONS } from '../../game/modes/expeditions'
import { journeyBestKey, type JourneyConfig } from '../../game/modes/journey'
import { saveSetup } from '../../game/profile/settings'
import { Choice } from '../../ui/controls'
import { SetupSheet } from '../../ui/SetupSheet'
import { useApp } from '../AppContext'
import { loadJourneyConfig, starsForScore } from './config'

// Oceania's island nations are too far apart to travel between.
const QUICK_REGIONS = ['World', ...REGIONS.filter((r) => r !== 'Oceania')] as const

export function JourneySetup({ onClose, onPlay }: { onClose: () => void; onPlay: () => void }) {
  const { profile, geo } = useApp()
  const [config, setConfig] = useState<JourneyConfig>(loadJourneyConfig)
  const [lastExpedition, setLastExpedition] = useState(
    config.kind === 'expedition' ? config.expeditionId : EXPEDITIONS[0].id,
  )

  return (
    <SetupSheet
      mode="World Journey"
      note={config.kind === 'quick' ? 'A random journey of 5–9 steps' : undefined}
      best={profile.bests[journeyBestKey(config)]?.score}
      onClose={onClose}
      onPlay={() => {
        saveSetup('journey', config)
        onPlay()
      }}
    >
      <Choice
        label="Journey"
        value={config.kind}
        onChange={(kind) =>
          setConfig(
            kind === 'quick'
              ? { kind, region: 'World' }
              : { kind: 'expedition', expeditionId: lastExpedition },
          )
        }
        options={[
          { value: 'quick', label: 'Quick journey' },
          { value: 'expedition', label: 'Expeditions', hint: 'Famous routes with a twist.' },
        ]}
      />
      {config.kind === 'quick' ? (
        <Choice
          label="Region"
          layout="chips"
          value={config.region}
          onChange={(region) => setConfig({ kind: 'quick', region })}
          options={QUICK_REGIONS.map((region) => ({ value: region, label: region }))}
        />
      ) : (
        <div className="expeditions" role="radiogroup" aria-label="Expedition">
          {EXPEDITIONS.map((expedition) => {
            const stars = starsForScore(profile.bests[`journey:${expedition.id}`]?.score)
            return (
              <button
                key={expedition.id}
                type="button"
                role="radio"
                aria-checked={config.expeditionId === expedition.id}
                className="expedition"
                onClick={() => {
                  setLastExpedition(expedition.id)
                  setConfig({ kind: 'expedition', expeditionId: expedition.id })
                }}
              >
                <span className="expedition__title">
                  {expedition.title}
                  <span className="expedition__stars" aria-label={`${stars} of 3 stars`}>
                    {'★'.repeat(stars)}
                    <span>{'★'.repeat(3 - stars)}</span>
                  </span>
                </span>
                <span className="expedition__route">
                  {geo.nameOf(expedition.from)} → {geo.nameOf(expedition.to)}
                  {expedition.ruleText && ` · ${expedition.ruleText}`}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </SetupSheet>
  )
}
