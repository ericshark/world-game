import type { RoundResult } from '../game/core/types'
import { MAX_POINTS } from '../geo/scoring'
import { formatKm, formatNumber } from './format'

interface PlayingScreenProps {
  targetName: string
  round: number
  totalRounds: number
  score: number
  hasPin: boolean
  result: RoundResult | null
  /** Display name of the place under the pin, when it is not the target. */
  clickedName: string | null
  showGrid: boolean
  onShowGridChange: (show: boolean) => void
  onConfirm: () => void
  onNext: () => void
  onQuit: () => void
}

export function PlayingScreen({
  targetName,
  round,
  totalRounds,
  score,
  hasPin,
  result,
  clickedName,
  showGrid,
  onShowGridChange,
  onConfirm,
  onNext,
  onQuit,
}: PlayingScreenProps) {
  const isLastRound = round + 1 >= totalRounds

  return (
    <div className="screen screen--playing">
      <header className="hud">
        <p className="hud__round">
          Round {round + 1} / {totalRounds} · {formatNumber(score)} points
        </p>
        <h1 className="hud__prompt">
          Find <strong data-testid="target-name">{targetName}</strong>
        </h1>
      </header>

      <div className="corner-controls">
        <label className="toggle">
          <input
            type="checkbox"
            checked={showGrid}
            onChange={(event) => onShowGridChange(event.target.checked)}
          />
          Grid
        </label>
        <button type="button" className="button button--ghost" onClick={onQuit}>
          Quit
        </button>
      </div>

      <div className="action-bar">
        {result ? (
          <div className="panel result" data-testid="round-result">
            <ResultHeadline result={result} targetName={targetName} clickedName={clickedName} />
            <p className="result__points">
              +{formatNumber(result.points)}
              <span> / {formatNumber(MAX_POINTS)}</span>
            </p>
            <button type="button" className="button button--primary" onClick={onNext}>
              {isLastRound ? 'See results' : 'Next'}
            </button>
          </div>
        ) : (
          <div className="panel placing">
            <p>{hasPin ? 'Happy with your pin?' : 'Click the globe to place your pin'}</p>
            <button
              type="button"
              className="button button--primary"
              disabled={!hasPin}
              onClick={onConfirm}
            >
              Confirm
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ResultHeadline({
  result,
  targetName,
  clickedName,
}: {
  result: RoundResult
  targetName: string
  clickedName: string | null
}) {
  if (result.kind === 'missed') {
    return (
      <div className="result__headline">
        <p className="result__verdict">Time's up</p>
        <p className="result__detail">{targetName} is highlighted on the globe</p>
      </div>
    )
  }

  if (result.hit) {
    return (
      <div className="result__headline">
        <p className="result__verdict result__verdict--hit">Correct!</p>
        <p className="result__detail">
          {result.distanceKm > 0
            ? `Close enough: ${formatKm(result.distanceKm)} from ${targetName}`
            : `You found ${targetName}`}
        </p>
      </div>
    )
  }

  return (
    <div className="result__headline">
      <p className="result__verdict">
        You clicked <strong>{clickedName ?? 'the ocean'}</strong>
      </p>
      <p className="result__detail">
        {formatKm(result.distanceKm)} from {targetName}
      </p>
    </div>
  )
}
