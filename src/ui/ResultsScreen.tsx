import type { ReactNode } from 'react'
import { unlockedAt, unlockedBy } from '../game/profile/cosmetics'
import type { RecordedSession } from '../game/profile/record'
import { levelForXp, xpForLevel } from '../game/profile/xp'
import { formatNumber } from '../screens/format'
import type { Tone } from './grades'
import { Icon } from './Icon'
import { ShareButton } from './ShareButton'
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
  recorded: RecordedSession
  /** Names countries mastered during the game. */
  nameOf?: (id: string) => string
  /** Offer a link to the same game, and compare with the score being challenged. */
  challenge?: { link: string; rival: number | null }
  tiles: { label: string; value: string }[]
  rows: ResultRow[]
  /** Left out when the game cannot be replayed (daily puzzles). */
  onPlayAgain?: () => void
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
  recorded,
  nameOf,
  challenge,
  tiles,
  rows,
  onPlayAgain,
  onChangeSetup,
  onHome,
  children,
}: ResultsScreenProps) {
  const shown = useCountUp(score, 1200)
  const { previousBest, isPersonalBest } = recorded
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

        {challenge?.rival !== null && challenge?.rival !== undefined && (
          <p className={`results__rival${score > challenge.rival ? ' is-win' : ''}`}>
            {score > challenge.rival
              ? `You beat the challenge: ${formatNumber(score)} to ${formatNumber(challenge.rival)}!`
              : score === challenge.rival
                ? `A draw at ${formatNumber(score)}!`
                : `Not this time: they scored ${formatNumber(challenge.rival)}.`}
          </p>
        )}

        <Rewards recorded={recorded} nameOf={nameOf} />

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
          {onPlayAgain && (
            <>
              <button
                type="button"
                className="button button--primary"
                onClick={onPlayAgain}
                autoFocus
              >
                Play again
              </button>
              <button type="button" className="button button--ghost" onClick={onChangeSetup}>
                Change setup
              </button>
            </>
          )}
          {challenge && (
            <ShareButton
              text={`Can you beat my ${formatNumber(score)} in World Game? ${challenge.link}`}
              label="Challenge a friend"
            />
          )}
          <button
            type="button"
            className={`button ${onPlayAgain ? 'button--ghost' : 'button--primary'}`}
            onClick={onHome}
            autoFocus={!onPlayAgain}
          >
            {onPlayAgain ? 'Home' : 'Done'}
          </button>
        </div>
      </section>
    </div>
  )
}

/** XP, level-ups, achievements and newly mastered countries earned by the game. */
function Rewards({
  recorded,
  nameOf,
}: {
  recorded: RecordedSession
  nameOf?: (id: string) => string
}) {
  const xp = recorded.profile.xp
  const level = levelForXp(xp)
  const floor = xpForLevel(level)
  const progress = (xp - floor) / (xpForLevel(level + 1) - floor)
  const shownXp = useCountUp(recorded.xpGained, 900)
  const levelledUp = recorded.levelAfter > recorded.levelBefore
  const unlocks = [
    ...Array.from({ length: recorded.levelAfter - recorded.levelBefore }, (_, i) =>
      unlockedAt(recorded.levelBefore + i + 1),
    ).flat(),
    ...unlockedBy(recorded.achievements.map((a) => a.id)),
  ]

  return (
    <div className="rewards">
      <div className="rewards__xp">
        <span className="rewards__level">Level {level}</span>
        <span className="xp-bar" aria-hidden="true">
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
        <span className="rewards__gain">+{formatNumber(shownXp)} XP</span>
      </div>
      {(levelledUp || unlocks.length > 0) && (
        <p className="rewards__note">
          <Icon name="trophy" size={16} /> {levelledUp && 'Level up!'}
          {unlocks.length > 0 && ` Unlocked: ${unlocks.map((u) => u.label).join(', ')}`}
        </p>
      )}
      {recorded.achievements.length > 0 && (
        <ul className="badges" aria-label="Achievements unlocked">
          {recorded.achievements.map((achievement) => (
            <li key={achievement.id} className="badge">
              <Icon name="trophy" size={16} />
              <span>
                <strong>{achievement.title}</strong>
                {achievement.description}
              </span>
            </li>
          ))}
        </ul>
      )}
      {recorded.newlyMastered.length > 0 && nameOf && (
        <p className="rewards__note">
          <Icon name="check" size={16} /> Mastered: {recorded.newlyMastered.map(nameOf).join(', ')}
        </p>
      )}
    </div>
  )
}
