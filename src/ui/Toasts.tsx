import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from './Icon'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: number
  key?: string
  icon: IconName
  title: string
  text?: string
  persistent?: boolean
  action?: ToastAction
}

const TOAST_MS = 4500

/** The notices, stacked in the top layer and read out politely by screen readers. */
export function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const latest = toasts.at(-1)
  const announcement = latest
    ? [latest.title, latest.text, latest.action ? 'Actions available' : '']
        .filter(Boolean)
        .join('. ')
    : ''

  useEffect(() => {
    const el = containerRef.current as
      (HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void }) | null
    if (!el) return
    try {
      if (toasts.length > 0) {
        if (typeof el.showPopover === 'function' && !el.matches(':popover-open')) {
          el.showPopover()
        }
      } else if (typeof el.hidePopover === 'function' && el.matches(':popover-open')) {
        el.hidePopover()
      }
    } catch {
      // Browsers without native Popover support render the fixed region directly.
    }
  }, [toasts.length])

  return (
    <>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <div
        ref={containerRef}
        className="toasts"
        role="region"
        aria-label="Notifications"
        popover="manual"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </div>
    </>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (toast.persistent || hovered || focused) return
    const timeout = window.setTimeout(() => onDismiss(toast.id), TOAST_MS)
    return () => window.clearTimeout(timeout)
  }, [toast.id, toast.persistent, hovered, focused, onDismiss])

  return (
    <div
      className="toast"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
      }}
    >
      <span className="toast__icon" aria-hidden="true">
        <Icon name={toast.icon} size={18} />
      </span>
      <span className="toast__body">
        <strong>{toast.title}</strong>
        {toast.text && <small>{toast.text}</small>}
      </span>
      <span className="toast__actions">
        {toast.action && (
          <button
            type="button"
            className="button button--primary toast__action"
            onClick={toast.action.onClick}
          >
            {toast.action.label}
          </button>
        )}
        <button
          type="button"
          className="icon-button toast__close"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss notification"
        >
          <Icon name="close" size={16} />
        </button>
      </span>
    </div>
  )
}
