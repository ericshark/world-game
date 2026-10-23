export interface CoachStep {
  title: string
  text: string
}

/** A guided-tour tip, shown just above the controls it talks about. */
export function CoachMark({ step, onSkip }: { step: CoachStep; onSkip: () => void }) {
  return (
    <div className="coach" role="note" aria-live="polite">
      <p className="coach__title">{step.title}</p>
      <p className="coach__text">{step.text}</p>
      <button type="button" className="button button--link coach__skip" onClick={onSkip}>
        Skip the tour
      </button>
    </div>
  )
}
