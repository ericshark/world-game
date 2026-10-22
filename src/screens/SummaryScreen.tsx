import type { RoundResult } from '../game/core/types'
import { MAX_POINTS } from '../geo/scoring'
import { formatKm, formatNumber } from './format'

interface SummaryScreenProps {
  results: RoundResult[]
  nameOf: (id: string) => string
  onPlayAgain: () => void
  onChangeSettings: () => void
}

export function SummaryScreen({
  results,
  nameOf,
  onPlayAgain,
  onChangeSettings,
}: SummaryScreenProps) {
  const total = results.reduce((sum, result) => sum + result.points, 0)
  const maxTotal = results.length * MAX_POINTS
  const hits = results.filter((result) => result.hit).length

  return (
    <div className="screen screen--center">
      <div className="panel summary-panel">
        <p className="eyebrow">Game over</p>
        <p className="summary__total" data-testid="summary-total">
          {formatNumber(total)}
          <span> / {formatNumber(maxTotal)}</span>
        </p>
        <p className="hint">
          Found {hits} of {results.length} countries
        </p>

        <ol className="round-list">
          {results.map((result, index) => (
            <li key={result.targetId} className={result.hit ? 'is-hit' : undefined}>
              <span className="round-list__index">{index + 1}</span>
              <span className="round-list__name">{nameOf(result.targetId)}</span>
              <span className="round-list__distance">
                {result.hit ? '✓' : result.kind === 'locate' ? formatKm(result.distanceKm) : '—'}
              </span>
              <span className="round-list__points">{formatNumber(result.points)}</span>
            </li>
          ))}
        </ol>

        <div className="button-row">
          <button type="button" className="button button--primary" onClick={onPlayAgain}>
            Play again
          </button>
          <button type="button" className="button button--ghost" onClick={onChangeSettings}>
            Change settings
          </button>
        </div>
      </div>
    </div>
  )
}
