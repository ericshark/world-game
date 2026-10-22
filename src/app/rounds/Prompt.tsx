import type { Challenge } from '../../game/core/types'
import { Icon } from '../../ui/Icon'

export interface PromptProps {
  challenge: Challenge
  answerName: string | null
  hintLetter: string | null
  showCapitalCountry: boolean
  nameOf: (id: string) => string
  capitalOf: (id: string) => string
  open: boolean
}

/** The question at the top of the screen, for any kind of round. */
export function Prompt({
  challenge,
  answerName,
  hintLetter,
  showCapitalCountry,
  nameOf,
  capitalOf,
  open,
}: PromptProps) {
  switch (challenge.kind) {
    case 'identify':
      return (
        <>
          <h1 className="prompt__text">Name this country</h1>
          {hintLetter && <p className="prompt__sub">Starts with “{hintLetter}”</p>}
        </>
      )
    case 'category':
      return (
        <>
          <p className="prompt__eyebrow">
            <Icon name="gem" size={16} /> Think rare
          </p>
          <h1 className="prompt__text prompt__text--small">{challenge.category.prompt}</h1>
          {open && answerName && (
            <p className="prompt__sub">
              Now find <strong>{answerName}</strong> on the globe
            </p>
          )}
        </>
      )
    case 'capital':
      return (
        <>
          <h1 className="prompt__text">
            Find <strong data-testid="target-name">{capitalOf(challenge.countryId)}</strong>
          </h1>
          {showCapitalCountry && (
            <p className="prompt__sub">capital of {nameOf(challenge.countryId)}</p>
          )}
        </>
      )
    case 'locate':
      return (
        <h1 className="prompt__text">
          Find <strong data-testid="target-name">{nameOf(challenge.countryId)}</strong>
        </h1>
      )
  }
}
