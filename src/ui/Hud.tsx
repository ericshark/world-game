import type { ReactNode } from 'react'
import { formatNumber } from '../screens/format'
import { Icon } from './Icon'
import { useCountUp } from './useCountUp'

interface HudProps {
  mode: string
  /** E.g. "Round 3 / 10". */
  progress?: string
  score?: number
  /** Consecutive successes; shown from 2. */
  streak?: number
  /** Extra items, such as a timer. */
  children?: ReactNode
  onHelp?: () => void
  onQuit: () => void
}

/** The bar across the top of every game. */
export function Hud({ mode, progress, score, streak = 0, children, onHelp, onQuit }: HudProps) {
  const shownScore = useCountUp(score ?? 0, 500)
  return (
    <header className="hud">
      <button type="button" className="icon-button hud__quit" onClick={onQuit} aria-label="Quit">
        <Icon name="back" />
      </button>
      <div className="hud__info">
        <span className="hud__mode">{mode}</span>
        {progress && <span className="hud__progress">{progress}</span>}
      </div>
      <div className="hud__right">
        {streak >= 2 && (
          <span className="hud__streak" aria-label={`Streak of ${streak}`}>
            <Icon name="flame" size={16} />
            {streak}
          </span>
        )}
        {score !== undefined && (
          <span className="hud__score" aria-label={`Score ${formatNumber(score)}`}>
            {formatNumber(shownScore)}
          </span>
        )}
        {children}
        {onHelp && (
          <button type="button" className="icon-button" onClick={onHelp} aria-label="How to play">
            <Icon name="help" />
          </button>
        )}
      </div>
    </header>
  )
}
