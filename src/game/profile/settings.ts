import { REGIONS } from '../../geo/countries'
import type { ScoringRegion } from '../../geo/scoring'
import type { Difficulty } from '../core/targets'
import { DEFAULT_PINPOINT_CONFIG, type PinpointConfig } from '../modes/pinpoint'
import { readJson, writeJson, type JsonStorage } from './storage'

const PINPOINT_KEY = 'world-game:settings:v1'
const PREFERENCES_KEY = 'world-game:preferences:v1'

export type Units = 'km' | 'mi'
export type Placement = 'tap' | 'crosshair'
export type MotionPreference = 'system' | 'reduced' | 'full'

/** How the player likes the game to look, sound and behave. */
export interface Preferences {
  sound: boolean
  /** 0 to 1. */
  volume: number
  motion: MotionPreference
  units: Units
  /** Tap the globe, or drag it under a fixed crosshair (more precise on phones). */
  placement: Placement
  showGrid: boolean
  /** Draw country borders on the globe, in every mode. */
  showBorders: boolean
  /** Modes whose "how to play" card the player has already seen. */
  seenIntros: string[]
  /** Shown to other players in battles. */
  playerName: string
}

export const DEFAULT_PREFERENCES: Preferences = {
  sound: true,
  volume: 0.6,
  motion: 'system',
  units: 'km',
  placement: 'tap',
  showGrid: false,
  showBorders: false,
  seenIntros: [],
  playerName: '',
}

/** The last Pinpoint setup, so the setup screen remembers your choices. */
export function loadPinpointConfig(storage?: JsonStorage): PinpointConfig {
  return sanitizePinpointConfig(readJson<Partial<PinpointConfig>>(PINPOINT_KEY, {}, storage))
}

/** A valid Pinpoint setup from saved or shared values, with defaults for anything invalid. */
export function sanitizePinpointConfig(saved: Partial<PinpointConfig>): PinpointConfig {
  const d = DEFAULT_PINPOINT_CONFIG
  return {
    region: isRegion(saved.region) ? saved.region : d.region,
    difficulty: oneOf<Difficulty>(saved.difficulty, ['easy', 'normal', 'hard'], d.difficulty),
    target: oneOf(saved.target, ['countries', 'capitals'], d.target),
    variant: oneOf(saved.variant, ['find', 'name'], d.variant),
    night: saved.night === true,
    skipMicro: saved.skipMicro === true,
    practiceWeak: saved.practiceWeak === true,
  }
}

export function savePinpointConfig(config: PinpointConfig, storage?: JsonStorage): void {
  writeJson(PINPOINT_KEY, config, storage)
}

/**
 * The last setup of a mode, cleaned by `sanitize` so old or tampered values fall back to
 * defaults.
 */
export function loadSetup<T>(
  mode: string,
  sanitize: (saved: Partial<T>) => T,
  storage?: JsonStorage,
): T {
  return sanitize(readJson<Partial<T>>(setupKey(mode), {}, storage))
}

export function saveSetup<T>(mode: string, setup: T, storage?: JsonStorage): void {
  writeJson(setupKey(mode), setup, storage)
}

function setupKey(mode: string) {
  return `world-game:setup:${mode}:v1`
}

export function sanitizeRegion(value: unknown, fallback: ScoringRegion): ScoringRegion {
  return isRegion(value) ? value : fallback
}

export function loadPreferences(storage?: JsonStorage): Preferences {
  const saved = readJson<Partial<Preferences>>(PREFERENCES_KEY, {}, storage)
  const d = DEFAULT_PREFERENCES
  const volume =
    typeof saved.volume === 'number' ? Math.min(1, Math.max(0, saved.volume)) : d.volume
  return {
    sound: typeof saved.sound === 'boolean' ? saved.sound : d.sound,
    volume,
    motion: oneOf(saved.motion, ['system', 'reduced', 'full'], d.motion),
    units: oneOf(saved.units, ['km', 'mi'], d.units),
    placement: oneOf(saved.placement, ['tap', 'crosshair'], d.placement),
    showGrid: saved.showGrid === true,
    showBorders: saved.showBorders === true,
    playerName: typeof saved.playerName === 'string' ? saved.playerName.slice(0, 20) : '',
    seenIntros: Array.isArray(saved.seenIntros)
      ? saved.seenIntros.filter((id) => typeof id === 'string')
      : d.seenIntros,
  }
}

export function savePreferences(preferences: Preferences, storage?: JsonStorage): void {
  writeJson(PREFERENCES_KEY, preferences, storage)
}

function isRegion(value: unknown): value is ScoringRegion {
  return value === 'World' || REGIONS.some((region) => region === value)
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback
}
