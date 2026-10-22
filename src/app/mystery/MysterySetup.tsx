import { useState } from 'react'
import { mysteryBestKey } from '../../game/modes/mystery'
import { saveSetup } from '../../game/profile/settings'
import { Choice } from '../../ui/controls'
import { SetupSheet } from '../../ui/SetupSheet'
import { useApp } from '../AppContext'
import { loadMysteryConfig } from './config'

export function MysterySetup({ onClose, onPlay }: { onClose: () => void; onPlay: () => void }) {
  const { profile } = useApp()
  const [config, setConfig] = useState(loadMysteryConfig)
  return (
    <SetupSheet
      mode="Mystery Country"
      note="One hidden country · fewer guesses, more points"
      best={profile.bests[mysteryBestKey(config)]?.score}
      onClose={onClose}
      onPlay={() => {
        saveSetup('mystery', config)
        onPlay()
      }}
    >
      <Choice
        label="Difficulty"
        value={config.difficulty}
        onChange={(difficulty) => setConfig({ difficulty })}
        options={[
          { value: 'normal', label: 'Normal', hint: 'Any country except micro-states.' },
          { value: 'hard', label: 'Hard', hint: 'Any country at all, even Tuvalu.' },
        ]}
      />
    </SetupSheet>
  )
}
