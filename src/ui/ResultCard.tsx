import type { ReactNode } from 'react'
import { MAX_POINTS } from '../geo/scoring'
import { formatNumber } from '../screens/format'
import type { Grade } from './grades'
import { useCountUp } from './useCountUp'

interface ResultCardProps {
  grade: Grade
  verdict: ReactNode
  detail?: ReactNode
  points: number
  maxPoints?: number
  nextLabel: string
  onNext: () => void
  children?: ReactNode
}

/** The reveal at the end of a round: verdict, points, and the way on. */
export function ResultCard({
  grade,
  verdict,
  detail,
  points,
  maxPoints = MAX_POINTS,
  nextLabel,
  onNext,
  children,
}: ResultCardProps) {
  const shown = useCountUp(points)
  return (
    <section className="panel result-card" data-testid="round-result" aria-live="polite">
      <div className="result-card__main">
        <div className="result-card__text">
          <span className={`grade grade--${grade.tone}`}>{grade.label}</span>
          <p className="result-card__verdict">{verdict}</p>
          {detail && <p className="result-card__detail">{detail}</p>}
        </div>
        <p className="result-card__points">
          +{formatNumber(shown)}
          <span> / {formatNumber(maxPoints)}</span>
        </p>
        {/* Focus moves here so Enter, Space or a screen reader can carry on. */}
        <button type="button" className="button button--primary" onClick={onNext} autoFocus>
          {nextLabel}
        </button>
      </div>
      {children}
    </section>
  )
}
