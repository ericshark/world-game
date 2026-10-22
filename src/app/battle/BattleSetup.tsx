import { useState } from 'react'
import { battleBestKey } from '../../game/modes/battle'
import { saveSetup } from '../../game/profile/settings'
import { Choice } from '../../ui/controls'
import { Icon } from '../../ui/Icon'
import { SetupSheet } from '../../ui/SetupSheet'
import { useApp } from '../AppContext'
import { loadBattleSetup, type BattleSetupConfig } from './setup'

export function BattleSetup({ onClose, onPlay }: { onClose: () => void; onPlay: () => void }) {
  const { profile, preferences, setPreferences, navigate } = useApp()
  const [setup, setSetup] = useState(loadBattleSetup)
  const update = (patch: Partial<BattleSetupConfig>) => setSetup((s) => ({ ...s, ...patch }))
  const wins = profile.history.filter(
    (h) => h.bestKey === battleBestKey(setup) && h.metrics?.won === 1,
  ).length

  return (
    <SetupSheet
      mode="World Battle"
      note={`Against computer opponents${wins ? ` · ${wins} ${wins === 1 ? 'win' : 'wins'}` : ''}`}
      onClose={onClose}
      onPlay={() => {
        saveSetup('battle', setup)
        onPlay()
      }}
    >
      <label className="text-field">
        <span>Your name</span>
        <input
          type="text"
          value={preferences.playerName}
          maxLength={20}
          placeholder="You"
          onChange={(event) => setPreferences({ playerName: event.target.value })}
        />
      </label>
      <Choice
        label="Format"
        value={setup.format}
        onChange={(format) => update({ format })}
        options={[
          {
            value: 'duel',
            label: 'Duel',
            hint: 'One on one. Lose the round, lose HP: the gap in points, growing each round.',
          },
          { value: 'party', label: 'Party', hint: 'Up to 8 players, 10 rounds, most points wins.' },
          {
            value: 'survival',
            label: 'Survival',
            hint: 'Three lives each. The lowest score every round loses one.',
          },
          {
            value: 'teams',
            label: 'Teams',
            hint: 'Your team’s average score against theirs, Duel-style.',
          },
        ]}
      />
      <Choice
        label="Rounds"
        value={setup.content}
        onChange={(content) => update({ content })}
        options={[
          { value: 'pinpoint', label: 'Find countries' },
          {
            value: 'mixed',
            label: 'Mixed',
            hint: 'Countries, capitals, naming and Rare Earth, where shared answers are split.',
          },
        ]}
      />
      {(setup.format === 'party' || setup.format === 'survival') && (
        <Choice
          label="Opponents"
          value={String(setup.opponents)}
          onChange={(value) => update({ opponents: Number(value) })}
          options={['1', '3', '5', '7'].map((n) => ({ value: n, label: n }))}
        />
      )}
      {setup.format === 'teams' && (
        <Choice
          label="Team size"
          value={String(setup.teamSize)}
          onChange={(value) => update({ teamSize: value === '3' ? 3 : 2 })}
          options={[
            { value: '2', label: '2 v 2' },
            { value: '3', label: '3 v 3' },
          ]}
        />
      )}
      <button
        type="button"
        className="button button--block online-link"
        onClick={() => navigate({ name: 'online' })}
      >
        <Icon name="globe" size={18} /> Play with friends online instead
      </button>
      <Choice
        label="Opponents' skill"
        value={setup.skill}
        onChange={(skill) => update({ skill })}
        options={[
          { value: 'novice', label: 'Novice' },
          { value: 'traveller', label: 'Traveller' },
          { value: 'explorer', label: 'Explorer' },
          { value: 'cartographer', label: 'Cartographer' },
        ]}
      />
    </SetupSheet>
  )
}
