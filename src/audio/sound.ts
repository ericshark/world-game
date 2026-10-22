// Sound effects synthesised with the Web Audio API: no files to download or license, and they
// stay crisp at any volume. Each cue is a few enveloped notes.

export type Cue =
  'pin' | 'confirm' | 'hit' | 'near' | 'miss' | 'next' | 'tick' | 'streak' | 'finish' | 'best'

interface Note {
  /** Hz. */
  freq: number
  /** Seconds after the cue starts. */
  at: number
  duration: number
  type?: OscillatorType
  gain?: number
  /** Glide to this frequency over the note. */
  slideTo?: number
}

const C5 = 523.25
const E5 = 659.25
const G5 = 783.99
const C6 = 1046.5

const CUES: Record<Cue, Note[]> = {
  pin: [{ freq: 880, at: 0, duration: 0.06, type: 'triangle', gain: 0.5, slideTo: 660 }],
  confirm: [{ freq: 440, at: 0, duration: 0.08, type: 'triangle', gain: 0.5 }],
  next: [{ freq: 520, at: 0, duration: 0.07, type: 'sine', gain: 0.35, slideTo: 700 }],
  hit: [
    { freq: C5, at: 0, duration: 0.14, type: 'triangle' },
    { freq: E5, at: 0.07, duration: 0.14, type: 'triangle' },
    { freq: G5, at: 0.14, duration: 0.28, type: 'triangle' },
  ],
  near: [
    { freq: E5, at: 0, duration: 0.12, type: 'triangle', gain: 0.7 },
    { freq: G5, at: 0.08, duration: 0.2, type: 'triangle', gain: 0.7 },
  ],
  miss: [{ freq: 220, at: 0, duration: 0.3, type: 'sine', gain: 0.8, slideTo: 150 }],
  tick: [{ freq: 1200, at: 0, duration: 0.03, type: 'square', gain: 0.12 }],
  streak: [
    { freq: G5, at: 0, duration: 0.1, type: 'square', gain: 0.25 },
    { freq: C6, at: 0.08, duration: 0.18, type: 'square', gain: 0.25 },
  ],
  finish: [
    { freq: C5, at: 0, duration: 0.18, type: 'triangle' },
    { freq: G5, at: 0.12, duration: 0.18, type: 'triangle' },
    { freq: C6, at: 0.24, duration: 0.4, type: 'triangle' },
  ],
  best: [
    { freq: C5, at: 0, duration: 0.12, type: 'triangle' },
    { freq: E5, at: 0.1, duration: 0.12, type: 'triangle' },
    { freq: G5, at: 0.2, duration: 0.12, type: 'triangle' },
    { freq: C6, at: 0.3, duration: 0.5, type: 'triangle' },
    { freq: G5 * 2, at: 0.42, duration: 0.4, type: 'sine', gain: 0.4 },
  ],
}

let context: AudioContext | null = null
let enabled = true
let volume = 0.6

export function configureSound(options: { enabled: boolean; volume: number }) {
  enabled = options.enabled
  volume = options.volume
}

/** Plays a cue. Browsers only allow audio after a user gesture, which every cue follows. */
export function play(cue: Cue) {
  if (!enabled || volume <= 0) return
  try {
    context ??= new AudioContext()
    if (context.state === 'suspended') void context.resume()
    const start = context.currentTime + 0.01
    for (const note of CUES[cue]) playNote(context, note, start)
  } catch {
    // No audio support: the game is fully playable without sound.
  }
}

function playNote(audio: AudioContext, note: Note, cueStart: number) {
  const start = cueStart + note.at
  const end = start + note.duration
  const peak = 0.18 * volume * (note.gain ?? 1)

  const oscillator = audio.createOscillator()
  oscillator.type = note.type ?? 'sine'
  oscillator.frequency.setValueAtTime(note.freq, start)
  if (note.slideTo) oscillator.frequency.exponentialRampToValueAtTime(note.slideTo, end)

  const gain = audio.createGain()
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(peak, start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, end)

  oscillator.connect(gain).connect(audio.destination)
  oscillator.start(start)
  oscillator.stop(end + 0.02)
}

/** A short buzz on phones that support it. */
export function vibrate(pattern: number | number[]) {
  if (!enabled) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Not supported.
  }
}
