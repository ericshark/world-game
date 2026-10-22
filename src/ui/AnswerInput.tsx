import { useId, useState, type KeyboardEvent } from 'react'
import type { NameMatcher } from '../geo/names'

interface AnswerInputProps {
  matcher: NameMatcher
  nameOf: (id: string) => string
  /** Offer matching country names while typing. */
  suggestions: boolean
  placeholder: string
  submitLabel: string
  onSubmit: (id: string) => void
  /** Countries that cannot be chosen (already used), with the reason shown. */
  unavailable?: { ids: ReadonlySet<string>; reason: string }
}

const SUGGESTION_MIN_CHARS = 2

/**
 * Type a country's name. Aliases and small typos are accepted, ambiguous names ("Congo") ask
 * which one you meant, and suggestions (if enabled) come from every country, never only the
 * right ones.
 */
export function AnswerInput({
  matcher,
  nameOf,
  suggestions,
  placeholder,
  submitLabel,
  onSubmit,
  unavailable,
}: AnswerInputProps) {
  const [text, setText] = useState('')
  const [active, setActive] = useState(-1)
  const [choices, setChoices] = useState<string[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const listId = useId()

  const options =
    suggestions && text.trim().length >= SUGGESTION_MIN_CHARS ? matcher.suggest(text, 6) : []

  const choose = (id: string) => {
    if (unavailable?.ids.has(id)) {
      setMessage(`${nameOf(id)}: ${unavailable.reason}`)
      return
    }
    onSubmit(id)
  }

  const submit = () => {
    if (active >= 0 && options[active]) return choose(options[active])
    const match = matcher.match(text)
    setChoices(null)
    if (match.kind === 'match') return choose(match.id)
    if (match.kind === 'ambiguous') {
      setChoices(match.ids)
      setMessage('Which one did you mean?')
      return
    }
    setMessage(text.trim() ? `We don't know "${text.trim()}". Check the spelling?` : null)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && options.length > 0) {
      event.preventDefault()
      setActive((index) => (index + 1) % options.length)
    } else if (event.key === 'ArrowUp' && options.length > 0) {
      event.preventDefault()
      setActive((index) => (index <= 0 ? options.length - 1 : index - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      submit()
    } else if (event.key === 'Escape') {
      setActive(-1)
    }
  }

  return (
    <div className="answer">
      <div className="answer__row">
        <input
          className="answer__input"
          type="text"
          value={text}
          placeholder={placeholder}
          autoFocus
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          role="combobox"
          aria-label={placeholder}
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(event) => {
            setText(event.target.value)
            setActive(-1)
            setChoices(null)
            setMessage(null)
          }}
          onKeyDown={onKeyDown}
        />
        <button type="button" className="button button--primary" onClick={submit}>
          {submitLabel}
        </button>
      </div>

      {options.length > 0 && (
        <ul className="answer__suggestions" id={listId} role="listbox">
          {options.map((id, index) => (
            <li
              key={id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // Pointer down rather than click, so the input keeps focus on phones.
              onPointerDown={(event) => {
                event.preventDefault()
                choose(id)
              }}
            >
              {nameOf(id)}
            </li>
          ))}
        </ul>
      )}

      {message && (
        <p className="answer__message" role="status">
          {message}
        </p>
      )}
      {choices && (
        <div className="answer__choices">
          {choices.map((id) => (
            <button key={id} type="button" className="chip" onClick={() => choose(id)}>
              {nameOf(id)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
