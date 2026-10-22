import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'

interface SheetProps {
  title: string
  eyebrow?: string
  onClose?: () => void
  children: ReactNode
  footer?: ReactNode
  /** Wider layout for tables and grids. */
  wide?: boolean
}

/**
 * A dialog that floats over the globe: a centred card on desktop, a bottom sheet on phones.
 * Escape closes it, and focus moves into it when it opens.
 */
export function Sheet({ title, eyebrow, onClose, children, footer, wide }: SheetProps) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panel.current?.focus()
    if (!onClose) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="sheet-backdrop">
      <div
        ref={panel}
        className={`sheet panel${wide ? ' sheet--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="sheet__header">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 className="sheet__title" id={titleId}>
              {title}
            </h2>
          </div>
          {onClose && (
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          )}
        </header>
        <div className="sheet__body">{children}</div>
        {footer && <footer className="sheet__footer">{footer}</footer>}
      </div>
    </div>
  )
}
