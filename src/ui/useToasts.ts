import { useCallback, useRef, useState } from 'react'
import type { Toast } from './Toasts'

/** Enough to celebrate a big game without burying the screen. */
const MAX_SHOWN = 3

/** Short-lived notices, plus persistent action notices such as app updates. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = nextId.current++
    setToasts((shown) => {
      const filtered = toast.key ? shown.filter((item) => item.key !== toast.key) : shown
      const next = [...filtered, { ...toast, id }]
      if (next.length <= MAX_SHOWN) return next
      const persistent = next.filter((item) => item.persistent)
      const transient = next.filter((item) => !item.persistent)
      const room = Math.max(0, MAX_SHOWN - persistent.length)
      return [...persistent.slice(-MAX_SHOWN), ...(room === 0 ? [] : transient.slice(-room))]
    })
  }, [])
  const dismiss = useCallback((id: number) => {
    setToasts((shown) => shown.filter((toast) => toast.id !== id))
  }, [])
  return { toasts, push, dismiss }
}
