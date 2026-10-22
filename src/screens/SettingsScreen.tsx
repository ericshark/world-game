import { useApp } from '../app/AppContext'
import { play } from '../audio/sound'
import { Choice, Switch } from '../ui/controls'
import { Sheet } from '../ui/Sheet'

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const { preferences, setPreferences, resetProfile } = useApp()

  const reset = () => {
    if (window.confirm('Delete all your stats and personal bests? This cannot be undone.')) {
      resetProfile()
    }
  }

  return (
    <Sheet eyebrow="World Game" title="Settings" onClose={onClose}>
      <div className="switches">
        <Switch
          label="Sound effects"
          checked={preferences.sound}
          onChange={(sound) => {
            setPreferences({ sound })
            if (sound) play('hit')
          }}
        />
        <label className="slider">
          <span>Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={preferences.volume}
            disabled={!preferences.sound}
            onChange={(event) => setPreferences({ volume: Number(event.target.value) })}
            onPointerUp={() => play('pin')}
          />
        </label>
      </div>
      <Choice
        label="Motion"
        value={preferences.motion}
        onChange={(motion) => setPreferences({ motion })}
        options={[
          {
            value: 'system',
            label: 'System',
            hint: 'Follow your device’s reduced-motion setting.',
          },
          { value: 'reduced', label: 'Reduced', hint: 'Short camera moves, no animations.' },
          { value: 'full', label: 'Full' },
        ]}
      />
      <Choice
        label="Distances"
        value={preferences.units}
        onChange={(units) => setPreferences({ units })}
        options={[
          { value: 'km', label: 'Kilometres' },
          { value: 'mi', label: 'Miles' },
        ]}
      />
      <Choice
        label="Placing pins"
        value={preferences.placement}
        onChange={(placement) => setPreferences({ placement })}
        options={[
          { value: 'tap', label: 'Tap the globe' },
          {
            value: 'crosshair',
            label: 'Crosshair',
            hint: 'Turn the globe under a fixed crosshair, then drop the pin: precise on phones.',
          },
        ]}
      />
      <div className="switches">
        <Switch
          label="Latitude and longitude grid"
          checked={preferences.showGrid}
          onChange={(showGrid) => setPreferences({ showGrid })}
        />
      </div>

      <div className="settings__actions">
        <button
          type="button"
          className="button button--ghost"
          onClick={() => setPreferences({ seenIntros: [] })}
        >
          Show “How to play” again
        </button>
        <button type="button" className="button button--danger" onClick={reset}>
          Reset all progress
        </button>
      </div>
      <p className="settings__credit">
        Imagery: NASA Blue Marble and Black Marble. Borders: Natural Earth. Both public domain.
      </p>
    </Sheet>
  )
}
