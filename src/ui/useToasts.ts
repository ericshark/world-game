import { useCallback, useRef, useState } from 'react'
import type { Toast } from './Toasts'

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
