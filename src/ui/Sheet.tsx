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

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/**
 * A dialog that floats over the globe: a centred card on desktop, a bottom sheet on phones.
 * Focus moves into it when it opens, Tab stays inside it, Escape closes it, and focus goes
 * back to whatever opened it.
 */
export function Sheet({ title, eyebrow, onClose, children, footer, wide }: SheetProps) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  // Parents often pass a fresh onClose each render; keep the latest without re-running effects,
  // which would pull focus back to the panel after every change made inside it.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus()
    return () => {
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current?.()
      } else if (event.key === 'Tab' && panel.current) {
        trapTab(event, panel.current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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

function trapTab(event: KeyboardEvent, container: HTMLElement) {
  const focusable = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)]
  if (focusable.length === 0) {
    event.preventDefault()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  const outside = !container.contains(active)
  if (event.shiftKey && (active === first || active === container || outside)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || outside)) {
    event.preventDefault()
    first.focus()
  }
}
