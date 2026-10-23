import type { LonLat } from '../geo/coords'
import { REGIONS } from '../geo/countries'
import type { ScoringRegion } from '../geo/scoring'
import {
  BATTLE_ROUND_CHOICES_MS,
  type BattleContent,
  type BattleFormat,
  type BattleState,
  type Team,
} from '../game/modes/battle'
import type { BotSkill } from '../game/modes/bots'
import { TITLES, type PinShape } from '../game/profile/cosmetics'

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
  region: ScoringRegion
  roundMs: number
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  format: 'party',
  content: 'pinpoint',
  bots: 0,
  botSkill: 'traveller',
  region: 'World',
  roundMs: 25_000,
}

/** How a player looks to everyone else: their pin and the title they picked (by id). */
export interface Looks {
  color: string
  shape?: PinShape
  title?: string
}

export interface RoomMember extends Looks {
  id: string
  name: string
  connected: boolean
  /** Ready to start, in the lobby. */
  ready: boolean
  /** The side picked for a team game. */
  team?: Team
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
  | ({ t: 'create'; name: string } & Looks)
  | ({ t: 'join'; code: string; name: string; token?: string } & Looks)
  | { t: 'configure'; settings: RoomSettings }
  /** In the lobby: ready (or not) to start. */
  | { t: 'set-ready'; ready: boolean }
  | { t: 'team'; team: Team }
  | { t: 'kick'; playerId: string }
  | { t: 'start' }
  | { t: 'submit'; round: number; pin?: LonLat; answerId?: string; hintUsed?: boolean }
  /** Between rounds: ready for the next one. */
  | { t: 'ready' }
  /** After a game: back to the lobby for another. */
  | { t: 'lobby' }
  | { t: 'leave' }
  | { t: 'ping'; sentAt: number }

export type ServerErrorCode =
  /** The room is gone: it expired, or the server restarted. */
  | 'no-room'
  /** The host removed this player. */
  | 'kicked'
  /** The server is shutting down for a moment; the client should reconnect. */
  | 'restarting'

export type ServerMessage =
  | { t: 'welcome'; playerId: string; token: string; code: string }
  | { t: 'room'; room: RoomView; serverTime: number }
  | { t: 'pong'; sentAt: number; serverTime: number }
  | { t: 'error'; message: string; code?: ServerErrorCode }

const FORMATS: BattleFormat[] = ['duel', 'party', 'survival', 'teams']
const SKILLS: BotSkill[] = ['novice', 'traveller', 'explorer', 'cartographer']
const SHAPES: PinShape[] = ['classic', 'diamond', 'ring', 'flag']
const SCORING_REGIONS: ScoringRegion[] = ['World', ...REGIONS]
// Titles are chosen from a fixed list, never typed, so they cannot carry messages.
const TITLE_IDS = TITLES.map((title) => title.id).filter((id) => id !== 'none')

/**
 * A display name as it will be shown: Unicode-normalised, without control, formatting or
 * direction-changing characters (which can hide or disguise a name), and with single spaces.
 */
export function cleanName(raw: string): string {
  return raw.normalize('NFKC').replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim()
}

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
    case 'create': {
      const name = parseName(data.name)
      const looks = parseLooks(data)
      return name && looks ? { t: 'create', name, ...looks } : null
    }
    case 'join': {
      const name = parseName(data.name)
      const looks = parseLooks(data)
      if (typeof data.code !== 'string' || !name || !looks) return null
      if (data.token !== undefined && typeof data.token !== 'string') return null
      return {
        t: 'join',
        code: data.code.toUpperCase().slice(0, ROOM_CODE_LENGTH),
        name,
        ...looks,
        token: data.token as string | undefined,
      }
    }
    case 'configure': {
      const settings = parseSettings(data.settings)
      return settings ? { t: 'configure', settings } : null
    }
    case 'set-ready':
      return typeof data.ready === 'boolean' ? { t: 'set-ready', ready: data.ready } : null
    case 'team':
      return data.team === 'A' || data.team === 'B' ? { t: 'team', team: data.team } : null
    case 'kick':
      return typeof data.playerId === 'string' && data.playerId.length <= 32
        ? { t: 'kick', playerId: data.playerId }
        : null
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
      // The shape of a country id; the rules check it names a real country.
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
    case 'leave':
      return { t: data.t }
    default:
      return null
  }
}

function parseSettings(s: unknown): RoomSettings | null {
  if (!isRecord(s)) return null
  const bots = Number(s.bots)
  const roundMs = s.roundMs === undefined ? DEFAULT_ROOM_SETTINGS.roundMs : Number(s.roundMs)
  const region = s.region === undefined ? 'World' : s.region
  if (
    !FORMATS.includes(s.format as BattleFormat) ||
    (s.content !== 'pinpoint' && s.content !== 'mixed') ||
    !Number.isInteger(bots) ||
    bots < 0 ||
    bots >= MAX_PLAYERS ||
    !SKILLS.includes(s.botSkill as BotSkill) ||
    !SCORING_REGIONS.includes(region as ScoringRegion) ||
    !BATTLE_ROUND_CHOICES_MS.includes(roundMs)
  ) {
    return null
  }
  return {
    format: s.format as BattleFormat,
    content: s.content,
    bots,
    botSkill: s.botSkill as BotSkill,
    region: region as ScoringRegion,
    roundMs,
  }
}

function parseName(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_NAME_LENGTH * 4) return null
  const name = cleanName(value)
  return name.length > 0 && [...name].length <= MAX_NAME_LENGTH ? name : null
}

function parseLooks(data: Record<string, unknown>): Looks | null {
  if (typeof data.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(data.color)) return null
  if (data.shape !== undefined && !SHAPES.includes(data.shape as PinShape)) return null
  return {
    color: data.color,
    ...(data.shape !== undefined && { shape: data.shape as PinShape }),
    ...(TITLE_IDS.includes(data.title as string) && { title: data.title as string }),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
