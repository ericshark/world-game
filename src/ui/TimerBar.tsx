import { useCountdown } from './useCountdown'

interface TimerProps {
  /** Epoch ms when time runs out. */
  deadline: number
  totalMs: number
  /** When the clock was stopped, if it is stopped. */
  pausedAt?: number | null
  /** Seconds left at which the timer turns red (and ticks, if ticking). */
  warnFrom?: number
  tick?: boolean
}

/** A draining bar plus the seconds left, for timed rounds. */
export function TimerBar({
  deadline,
  totalMs,
  pausedAt = null,
  warnFrom = 5,
  tick = false,
}: TimerProps) {
  const { left, seconds, low } = useCountdown({ deadline, pausedAt, warnFrom, tick })
  return (
    <div className={`timer${low ? ' timer--low' : ''}`} role="timer" aria-live="off">
      <div className="timer__bar">
        <span style={{ width: `${(left / totalMs) * 100}%` }} />
      </div>
      <span className="timer__seconds">{seconds}s</span>
    </div>
  )
}

const RING_RADIUS = 20
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

/** A draining ring around the seconds left, for a clock that runs the whole game. */
export function TimerRing({
  deadline,
  totalMs,
  pausedAt = null,
  warnFrom = 10,
  tick = false,
}: TimerProps) {
  const { left, seconds, low } = useCountdown({ deadline, pausedAt, warnFrom, tick })
  const share = Math.min(1, left / totalMs)
  return (
    <div
      className={`timer-ring${low ? ' timer--low' : ''}`}
      role="timer"
      aria-live="off"
      aria-label={`${seconds} seconds left`}
    >
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle className="timer-ring__track" cx="24" cy="24" r={RING_RADIUS} />
        <circle
          className="timer-ring__fill"
          cx="24"
          cy="24"
          r={RING_RADIUS}
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - share)}
        />
      </svg>
      <span className="timer-ring__seconds">{seconds}</span>
    </div>
  )
}
