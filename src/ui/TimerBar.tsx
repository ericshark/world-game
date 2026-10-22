import { useEffect, useRef, useState } from 'react'

interface TimerBarProps {
  /** Epoch ms when time runs out. */
  deadline: number
  totalMs: number
  onTick?: (secondsLeft: number) => void
}

/** A draining bar plus the seconds left, for timed rounds. */
export function TimerBar({ deadline, totalMs, onTick }: TimerBarProps) {
  const [now, setNow] = useState(() => Date.now())
  const onTickRef = useRef(onTick)
  useEffect(() => {
    onTickRef.current = onTick
  })

  useEffect(() => {
    let frame = 0
    const step = () => {
      setNow(Date.now())
      if (Date.now() < deadline) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [deadline])

  const left = Math.max(0, deadline - now)
  const seconds = Math.ceil(left / 1000)
  useEffect(() => {
    if (seconds > 0) onTickRef.current?.(seconds)
  }, [seconds])

  return (
    <div className={`timer${seconds <= 5 ? ' timer--low' : ''}`} role="timer" aria-live="off">
      <div className="timer__bar">
        <span style={{ width: `${(left / totalMs) * 100}%` }} />
      </div>
      <span className="timer__seconds">{seconds}s</span>
    </div>
  )
}
