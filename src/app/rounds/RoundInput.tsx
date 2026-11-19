import type { Challenge } from '../../game/core/types'
import type { SubPackId, SubdivisionPack } from '../../geo/subdivisions'
import { AnswerInput } from '../../ui/AnswerInput'
import { Flag } from '../../ui/Flag'
import { Icon } from '../../ui/Icon'
import { useApp } from '../AppContext'

interface RoundInputProps {
  challenge: Challenge
  /** Resets typed text between rounds. */
  round: number
  /** A Rare Earth answer already named, waiting to be placed. */
  answerId: string | null
  hasPin: boolean
  hintUsed: boolean
  suggestions: boolean
  usedAnswers: ReadonlySet<string>
  /** First-game coaching on how to use the globe. */
  coach: boolean
  subdivisions?: Partial<Record<SubPackId, SubdivisionPack>>
  onAnswer: (id: string) => void
  onHint: () => void
  onChangeAnswer: () => void
  onDropAtCenter: () => void
  onConfirm: () => void
}

/**
 * The bottom panel while a round is open: names to type or choose, or pin placement with
 * Confirm. Shared by every round-based mode, single-player or battle.
 */
export function RoundInput(props: RoundInputProps) {
  const { geo, preferences } = useApp()
  const { challenge, subdivisions } = props
  const packId =
    (challenge.kind === 'locate' || challenge.kind === 'identify') && challenge.packId
      ? (challenge.packId as SubPackId)
      : undefined
  const pack = packId ? subdivisions?.[packId] : undefined
  const nameOf = (id: string) => (pack && pack.countries.get(id) ? pack.nameOf(id) : geo.nameOf(id))
  const matcher = pack ? pack.names : geo.names

  if (challenge.kind === 'identify') {
    return (
      <div className="panel answer-panel">
        {challenge.choices ? (
          <div className={`choice-grid${challenge.show === 'flag' ? ' choice-grid--flags' : ''}`}>
            {challenge.choices.map((id, index) =>
              challenge.show === 'flag' ? (
                <button
                  key={id}
                  type="button"
                  className="button button--flag"
                  aria-label={`Flag ${index + 1}`}
                  onClick={() => props.onAnswer(id)}
                >
                  <Flag geo={geo} id={id} size="choice" />
                </button>
              ) : (
                <button
                  key={id}
                  type="button"
                  className="button button--choice"
                  onClick={() => props.onAnswer(id)}
                >
                  {nameOf(id)}
                </button>
              ),
            )}
          </div>
        ) : (
          <AnswerInput
            key={props.round}
            matcher={matcher}
            nameOf={nameOf}
            suggestions={props.suggestions}
            placeholder={pack ? 'State or province name' : 'Country name'}
            submitLabel="Answer"
            onSubmit={props.onAnswer}
          />
        )}
        {!challenge.choices && !props.hintUsed && (
          <button type="button" className="button button--link" onClick={props.onHint}>
            Show first letter (half points)
          </button>
        )}
      </div>
    )
  }

  if (challenge.kind === 'category' && !props.answerId) {
    return (
      <div className="panel answer-panel">
        <AnswerInput
          key={props.round}
          matcher={geo.names}
          nameOf={nameOf}
          suggestions={props.suggestions}
          placeholder="Name a country"
          submitLabel="Next"
          onSubmit={props.onAnswer}
          unavailable={{ ids: props.usedAnswers, reason: 'already used this game' }}
        />
        <p className="answer-panel__hint">
          The rarer the answer, the more it is worth. You'll then place it on the globe.
        </p>
      </div>
    )
  }

  const crosshair = preferences.placement === 'crosshair'
  return (
    <div className="panel placing">
      <p className="placing__hint">
        {placingHint({
          coach: props.coach,
          hasPin: props.hasPin,
          crosshair,
          answerName: props.answerId ? nameOf(props.answerId) : null,
        })}
      </p>
      <div className="placing__actions">
        {challenge.kind === 'category' && (
          <button type="button" className="button" onClick={props.onChangeAnswer}>
            Change answer
          </button>
        )}
        {crosshair && (
          <button type="button" className="button" onClick={props.onDropAtCenter}>
            <Icon name="crosshair" size={18} /> Drop pin
          </button>
        )}
        <button
          type="button"
          className="button button--primary"
          disabled={!props.hasPin}
          onClick={props.onConfirm}
        >
          Confirm
        </button>
      </div>
    </div>
  )
}

function placingHint({
  coach,
  hasPin,
  crosshair,
  answerName,
}: {
  coach: boolean
  hasPin: boolean
  crosshair: boolean
  answerName: string | null
}) {
  if (answerName) return hasPin ? `Is that ${answerName}?` : `Tap ${answerName} on the globe`
  if (coach && !hasPin) return 'Drag to spin, scroll or pinch to zoom, then tap to drop your pin'
  if (hasPin) return 'Happy with your pin? You can still move it.'
  return crosshair
    ? 'Turn the globe until the crosshair is on target'
    : 'Tap the globe to drop your pin'
}
