import { useEffect } from 'react'
import { Icon, type IconName } from './Icon'

export interface Toast {
  id: number
  icon: IconName
  title: string
  text?: string
}

const TOAST_MS = 4500

/** The notices, stacked at the top of the screen and read out by screen readers. */
export function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: Toast[]
  onDismiss: (id: number) => void
}) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timeout = window.setTimeout(() => onDismiss(toast.id), TOAST_MS)
    return () => window.clearTimeout(timeout)
  }, [toast.id, onDismiss])
  return (
    <button type="button" className="toast" onClick={() => onDismiss(toast.id)}>
      <span className="toast__icon">
        <Icon name={toast.icon} size={18} />
      </span>
      <span>
        <strong>{toast.title}</strong>
        {toast.text && <small>{toast.text}</small>}
      </span>
    </button>
  )
}
