import { useEffect, useRef, useState } from 'react'
import { play } from '../audio/sound'

interface CountdownOptions {
  /** Epoch ms when time runs out. */
  deadline: number
  /** When the clock was stopped, if it is stopped. */
  pausedAt: number | null
  /** Seconds left at which time is running low. */
  warnFrom: number
  /** Tick audibly each second once time is low. */
  tick: boolean
}

/** Time left before a deadline, redrawn every frame while it runs. */
export function useCountdown({ deadline, pausedAt, warnFrom, tick }: CountdownOptions) {
  const [now, setNow] = useState(() => Date.now())
  const tickRef = useRef(tick)
  useEffect(() => {
    tickRef.current = tick
  })

  useEffect(() => {
    if (pausedAt !== null) return
    let frame = 0
    const step = () => {
      setNow(Date.now())
      if (Date.now() < deadline) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [deadline, pausedAt])

  const left = Math.max(0, deadline - (pausedAt ?? now))
  const seconds = Math.ceil(left / 1000)
  const low = seconds <= warnFrom
  useEffect(() => {
    if (tickRef.current && low && seconds > 0 && pausedAt === null) play('tick')
  }, [seconds, low, pausedAt])

  return { left, seconds, low }
}
