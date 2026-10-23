import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from './Icon'

export interface Toast {
  id: number
  icon: IconName
  title: string
  text?: string
}

const TOAST_MS = 4500
/** Enough to celebrate a big game without burying the screen. */
const MAX_SHOWN = 3

/** Short-lived notices, such as an achievement just unlocked. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = nextId.current++
    setToasts((shown) => [...shown, { ...toast, id }].slice(-MAX_SHOWN))
  }, [])
  const dismiss = useCallback((id: number) => {
    setToasts((shown) => shown.filter((toast) => toast.id !== id))
  }, [])
  return { toasts, push, dismiss }
}

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
