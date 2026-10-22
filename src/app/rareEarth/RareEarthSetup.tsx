import { useState } from 'react'
import { rareEarthBestKey } from '../../game/modes/rareEarth'
import { saveSetup } from '../../game/profile/settings'
import { Choice } from '../../ui/controls'
import { SetupSheet } from '../../ui/SetupSheet'
import { useApp } from '../AppContext'
import { loadRareEarthConfig } from './config'

export function RareEarthSetup({ onClose, onPlay }: { onClose: () => void; onPlay: () => void }) {
  const { profile } = useApp()
  const [config, setConfig] = useState(loadRareEarthConfig)
  return (
    <SetupSheet
      mode="Rare Earth"
      note="5 categories · name a country, then find it"
      best={profile.bests[rareEarthBestKey(config)]?.score}
      onClose={onClose}
      onPlay={() => {
        saveSetup('rare-earth', config)
        onPlay()
      }}
    >
      <Choice
        label="Difficulty"
        value={config.difficulty}
        onChange={(difficulty) => setConfig({ difficulty })}
        options={[
          { value: 'normal', label: 'Normal', hint: 'Spelling suggestions as you type, no clock.' },
          { value: 'hard', label: 'Hard', hint: 'No suggestions and 45 seconds a round.' },
        ]}
      />
    </SetupSheet>
  )
}
