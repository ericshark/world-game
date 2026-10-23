import { useState } from 'react'
import { rushBestKey } from '../../game/modes/rush'
import { saveSetup } from '../../game/profile/settings'
import { Choice, Switch } from '../../ui/controls'
import { RegionChoice, SetupSheet } from '../../ui/SetupSheet'
import { useApp } from '../AppContext'
import { loadRushConfig } from './config'

export function RushSetup({ onClose, onPlay }: { onClose: () => void; onPlay: () => void }) {
  const { profile } = useApp()
  const [config, setConfig] = useState(loadRushConfig)
  return (
    <SetupSheet
      mode="GeoRush"
      best={profile.bests[rushBestKey(config)]?.score}
      onClose={onClose}
      onPlay={() => {
        saveSetup('rush', config)
        onPlay()
      }}
    >
      <RegionChoice value={config.region} onChange={(region) => setConfig({ ...config, region })} />
      <Choice
        label="Rules"
        value={config.suddenDeath ? 'sudden' : 'clock'}
        onChange={(rules) => setConfig({ ...config, suddenDeath: rules === 'sudden' })}
        options={[
          {
            value: 'clock',
            label: '60 seconds',
            hint: 'Hits add 2 s, misses cost 3 s. Streaks multiply your points.',
          },
          { value: 'sudden', label: 'Sudden death', hint: 'No clock, no skips: one miss ends it.' },
        ]}
      />
      <div className="switches">
        <Switch
          label="Night Earth"
          description="Find your way by city lights"
          checked={config.night}
          onChange={(night) => setConfig({ ...config, night })}
        />
      </div>
    </SetupSheet>
  )
}
