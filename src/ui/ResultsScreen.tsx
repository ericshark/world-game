import type { ReactNode } from 'react'
import { formatNumber } from '../screens/format'
import type { Tone } from './grades'
import { Icon } from './Icon'
import { useCountUp } from './useCountUp'

export interface ResultRow {
  key: string
  label: string
  detail: string
  points: number
  tone: Tone
}

interface ResultsScreenProps {
  title: string
  subtitle?: string
  score: number
  maxScore: number | null
  previousBest: number | null
  isPersonalBest: boolean
  tiles: { label: string; value: string }[]
  rows: ResultRow[]
  onPlayAgain: () => void
  onChangeSetup: () => void
  onHome: () => void
  children?: ReactNode
}

/** End-of-game summary shared by every mode. */
export function ResultsScreen({
  title,
  subtitle,
  score,
  maxScore,
  previousBest,
  isPersonalBest,
  tiles,
  rows,
  onPlayAgain,
  onChangeSetup,
  onHome,
  children,
}: ResultsScreenProps) {
  const shown = useCountUp(score, 1200)
  const bestNote =
    previousBest === null
      ? 'Your first score in this setup'
      : isPersonalBest
        ? `New personal best! Previous: ${formatNumber(previousBest)}`
        : `Personal best: ${formatNumber(previousBest)}`

  return (
    <div className="screen screen--center">
      <section className="panel results" aria-labelledby="results-title">
        <p className="eyebrow">{subtitle ?? 'Game over'}</p>
        <h2 className="results__title" id="results-title">
          {title}
        </h2>
        <p className="results__score" data-testid="summary-total">
          {formatNumber(shown)}
          {maxScore !== null && <span> / {formatNumber(maxScore)}</span>}
        </p>
        <p className={`results__best${isPersonalBest && previousBest !== null ? ' is-new' : ''}`}>
          {isPersonalBest && previousBest !== null && <Icon name="trophy" size={16} />}
          {bestNote}
        </p>

        <div className="stat-tiles">
          {tiles.map((tile) => (
            <div className="tile" key={tile.label}>
              <p className="tile__value">{tile.value}</p>
              <p className="tile__label">{tile.label}</p>
            </div>
          ))}
        </div>

        {children}

        <ol className="round-list">
          {rows.map((row, index) => (
            <li key={row.key} className={`tone--${row.tone}`}>
              <span className="round-list__index">{index + 1}</span>
              <span className="round-list__name">{row.label}</span>
              <span className="round-list__detail">{row.detail}</span>
              <span className="round-list__points">{formatNumber(row.points)}</span>
            </li>
          ))}
        </ol>

        <div className="button-row">
          <button type="button" className="button button--primary" onClick={onPlayAgain} autoFocus>
            Play again
          </button>
          <button type="button" className="button button--ghost" onClick={onChangeSetup}>
            Change setup
          </button>
          <button type="button" className="button button--ghost" onClick={onHome}>
            Home
          </button>
        </div>
      </section>
    </div>
  )
}
