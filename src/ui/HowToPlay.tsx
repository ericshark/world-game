import { Icon, type IconName } from './Icon'
import { Sheet } from './Sheet'

export interface HowToStep {
  icon: IconName
  title: string
  text: string
}

interface HowToPlayProps {
  mode: string
  steps: HowToStep[]
  onClose: () => void
}

export function HowToPlay({ mode, steps, onClose }: HowToPlayProps) {
  return (
    <Sheet
      eyebrow="How to play"
      title={mode}
      onClose={onClose}
      footer={
        <button type="button" className="button button--primary button--block" onClick={onClose}>
          Got it
        </button>
      }
    >
      <ol className="howto">
        {steps.map((step) => (
          <li key={step.title}>
            <span className="howto__icon">
              <Icon name={step.icon} />
            </span>
            <span>
              <strong>{step.title}</strong>
              {step.text}
            </span>
          </li>
        ))}
      </ol>
    </Sheet>
  )
}
