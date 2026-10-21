import { REGIONS, type CountryIndex } from '../geo/countries'
import type { ScoringRegion } from '../geo/scoring'
import { ROUNDS_PER_GAME, type GameConfig } from '../game/gameReducer'
import { targetPool } from '../game/selectTargets'

const REGION_OPTIONS: ScoringRegion[] = ['World', ...REGIONS]

interface StartScreenProps {
  countries: CountryIndex | null
  config: GameConfig
  hasStats: boolean
  onConfigChange: (config: GameConfig) => void
  onPlay: () => void
  onShowStats: () => void
}

export function StartScreen({
  countries,
  config,
  hasStats,
  onConfigChange,
  onPlay,
  onShowStats,
}: StartScreenProps) {
  const poolSize = countries ? targetPool(countries.features, config).length : 0
  const rounds = Math.min(ROUNDS_PER_GAME, poolSize)

  return (
    <div className="screen screen--start">
      <div className="panel start-panel">
        <h1 className="title">World Game</h1>
        <p className="subtitle">Find countries on a borderless Earth.</p>

        <fieldset className="field">
          <legend>Region</legend>
          <div className="region-grid" role="radiogroup" aria-label="Region">
            {REGION_OPTIONS.map((region) => (
              <button
                key={region}
                type="button"
                role="radio"
                aria-checked={config.region === region}
                className="chip"
                onClick={() => onConfigChange({ ...config, region })}
              >
                {region}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="check">
          <input
            type="checkbox"
            checked={config.skipMicro}
            onChange={(event) => onConfigChange({ ...config, skipMicro: event.target.checked })}
          />
          <span>
            Skip micro-states
            <small>Tiny countries like Monaco, Nauru and Grenada</small>
          </span>
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={config.practiceWeak}
            onChange={(event) => onConfigChange({ ...config, practiceWeak: event.target.checked })}
          />
          <span>
            Practice my weak countries
            <small>
              {hasStats
                ? 'Countries you often miss come up more'
                : 'Play a game first so there is something to practise'}
            </small>
          </span>
        </label>

        <button
          type="button"
          className="button button--primary button--large"
          disabled={!countries || rounds === 0}
          onClick={onPlay}
        >
          {countries ? 'Play' : 'Loading…'}
        </button>
        <p className="hint">
          {countries ? `${poolSize} countries in the pool · ${rounds} rounds` : ' '}
        </p>

        <button type="button" className="button button--link" onClick={onShowStats}>
          Your stats
        </button>
      </div>
    </div>
  )
}
