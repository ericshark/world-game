import { useEffect, useRef, useState } from 'react'
import { easeOutCubic, useReducedMotion } from './motion'

/** Animates a number from its previous value to `value` (instantly with reduced motion). */
export function useCountUp(value: number, durationMs = 700): number {
  const reducedMotion = useReducedMotion()
  const [shown, setShown] = useState(0)
  const from = useRef(0)

  useEffect(() => {
    if (reducedMotion) {
      from.current = value
      return
    }
    const start = performance.now()
    const initial = from.current
    let frame = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const current = initial + (value - initial) * easeOutCubic(t)
      from.current = current
      setShown(current)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value, durationMs, reducedMotion])

  return reducedMotion ? value : Math.round(shown)
}
