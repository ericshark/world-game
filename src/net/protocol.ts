import type { LonLat } from '../geo/coords'
import type { BattleContent, BattleFormat, BattleState } from '../game/modes/battle'
import type { BotSkill } from '../game/modes/bots'

/**
 * Messages between browsers and the battle server. The server runs the same rules as local
 * games and is the only one that scores: clients send what the player did, never results.
 */

export const MAX_PLAYERS = 8
export const MAX_NAME_LENGTH = 20
export const ROOM_CODE_LENGTH = 4

export interface RoomSettings {
  format: BattleFormat
  content: BattleContent
  /** Computer opponents added to the human players. */
  bots: number
  botSkill: BotSkill
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  format: 'party',
  content: 'pinpoint',
  bots: 0,
  botSkill: 'traveller',
}

export interface RoomMember {
  id: string
  name: string
  color: string
  connected: boolean
}

/** What a player sees of a room: the lobby, and once playing, their view of the battle. */
export interface RoomView {
  code: string
  hostId: string
  members: RoomMember[]
  settings: RoomSettings
  phase: 'lobby' | 'playing' | 'finished'
  battle: BattleState | null
}

export type ClientMessage =
  | { t: 'create'; name: string; color: string }
  | { t: 'join'; code: string; name: string; color: string; token?: string }
  | { t: 'configure'; settings: RoomSettings }
  | { t: 'start' }
  | { t: 'submit'; round: number; pin?: LonLat; answerId?: string; hintUsed?: boolean }
  | { t: 'ready' }
  | { t: 'lobby' }
  | { t: 'ping'; sentAt: number }

export type ServerMessage =
  | { t: 'welcome'; playerId: string; token: string; code: string }
  | { t: 'room'; room: RoomView; serverTime: number }
  | { t: 'pong'; sentAt: number; serverTime: number }
  /** `no-room`: the room is gone (it expired, or the server restarted). */
  | { t: 'error'; message: string; code?: 'no-room' }

const FORMATS: BattleFormat[] = ['duel', 'party', 'survival', 'teams']
const SKILLS: BotSkill[] = ['novice', 'traveller', 'explorer', 'cartographer']

/** Parses and checks a client message; anything malformed is null. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(data) || typeof data.t !== 'string') return null
  switch (data.t) {
    case 'create':
      return isName(data.name) && isColor(data.color)
        ? { t: 'create', name: data.name.trim(), color: data.color }
        : null
    case 'join':
      return typeof data.code === 'string' &&
        isName(data.name) &&
        isColor(data.color) &&
        (data.token === undefined || typeof data.token === 'string')
        ? {
            t: 'join',
            code: data.code.toUpperCase().slice(0, ROOM_CODE_LENGTH),
            name: data.name.trim(),
            color: data.color,
            token: data.token as string | undefined,
          }
        : null
    case 'configure': {
      const s = data.settings
      if (!isRecord(s)) return null
      const bots = Number(s.bots)
      if (
        !FORMATS.includes(s.format as BattleFormat) ||
        (s.content !== 'pinpoint' && s.content !== 'mixed') ||
        !Number.isInteger(bots) ||
        bots < 0 ||
        bots >= MAX_PLAYERS ||
        !SKILLS.includes(s.botSkill as BotSkill)
      ) {
        return null
      }
      return {
        t: 'configure',
        settings: {
          format: s.format as BattleFormat,
          content: s.content,
          bots,
          botSkill: s.botSkill as BotSkill,
        },
      }
    }
    case 'submit': {
      if (!Number.isInteger(data.round)) return null
      const pin = data.pin
      const validPin =
        pin === undefined ||
        (Array.isArray(pin) &&
          pin.length === 2 &&
          pin.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
          Math.abs(pin[0]) <= 180 &&
          Math.abs(pin[1]) <= 90)
      const validAnswer =
        data.answerId === undefined ||
        (typeof data.answerId === 'string' && /^[A-Z]{3}$/.test(data.answerId))
      if (!validPin || !validAnswer) return null
      return {
        t: 'submit',
        round: data.round as number,
        pin: pin as LonLat | undefined,
        answerId: data.answerId as string | undefined,
        hintUsed: data.hintUsed === true,
      }
    }
    case 'ping':
      return typeof data.sentAt === 'number' ? { t: 'ping', sentAt: data.sentAt } : null
    case 'start':
    case 'ready':
    case 'lobby':
      return { t: data.t }
    default:
      return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_NAME_LENGTH
}

function isColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}
