import { useId, type ReactNode } from 'react'

export interface Option<T extends string> {
  value: T
  label: string
  hint?: string
}

interface ChoiceProps<T extends string> {
  label: string
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  /** "segments" sit in one row; "chips" wrap. */
  layout?: 'segments' | 'chips'
}

/** A labelled single choice, announced as a radio group. */
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
  layout = 'segments',
}: ChoiceProps<T>) {
  const labelId = useId()
  const selected = options.find((option) => option.value === value)
  return (
    <div className="field">
      <p className="field__label" id={labelId}>
        {label}
      </p>
      <div className={`choice choice--${layout}`} role="radiogroup" aria-labelledby={labelId}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            className="choice__option"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {selected?.hint && <p className="field__hint">{selected.hint}</p>}
    </div>
  )
}

interface SwitchProps {
  label: string
  description?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function Switch({ label, description, checked, onChange, disabled }: SwitchProps) {
  return (
    <label className="switch">
      <span className="switch__text">
        {label}
        {description && <small>{description}</small>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch__track" aria-hidden="true" />
    </label>
  )
}
