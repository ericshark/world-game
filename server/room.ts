import type { GeoData } from '../src/geo/facts'
import {
  battle,
  battleViewFor,
  type BattleConfig,
  type BattlePlayer,
  type BattleState,
} from '../src/game/modes/battle'
import { randomSeed } from '../src/game/core/random'
import {
  DEFAULT_ROOM_SETTINGS,
  MAX_PLAYERS,
  type ClientMessage,
  type RoomSettings,
  type RoomView,
  type ServerMessage,
} from '../src/net/protocol'

type Send = (message: ServerMessage) => void

interface Member {
  id: string
  name: string
  color: string
  /** Secret that lets a player reconnect as themselves. */
  token: string
  send: Send | null
}

const BOT_NAMES = ['Magellan', 'Ibn Battuta', 'Amelia', 'Zheng He', 'Nellie', 'Humboldt', 'Freya']
const BOT_COLORS = ['#5ad1ff', '#6be38a', '#b98aff', '#ff9a4a', '#ff7ad9', '#4fd1c5', '#a3e635']

/**
 * One private game: a lobby, then a battle run with the shared rules. The room is the only
 * place answers are scored, and each player is sent only what they may see.
 */
export class Room {
  readonly code: string
  hostId: string | null = null
  settings: RoomSettings = DEFAULT_ROOM_SETTINGS
  phase: RoomView['phase'] = 'lobby'
  lastActivity: number
  private readonly members: Member[] = []
  private battle: BattleState | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private nextId = 1

  private readonly geo: GeoData
  private readonly now: () => number

  constructor(code: string, geo: GeoData, now: () => number = Date.now) {
    this.code = code
    this.geo = geo
    this.now = now
    this.lastActivity = now()
  }

  get connectedCount(): number {
    return this.members.filter((m) => m.send).length
  }

  /** Adds a player, or reconnects one by token. Returns an error message on failure. */
  join(name: string, color: string, token: string | undefined, send: Send) {
    this.lastActivity = this.now()
    const returning = token ? this.members.find((m) => m.token === token) : undefined
    if (returning) {
      returning.send = send
      returning.name = name
      this.welcome(returning)
      return null
    }
    if (this.phase !== 'lobby') return 'This game has already started.'
    if (this.members.length + this.settings.bots >= MAX_PLAYERS) return 'This room is full.'
    const member: Member = {
      id: `p${this.nextId++}`,
      name,
      color: this.uniqueColor(color),
      token: randomSeed() + randomSeed(),
      send,
    }
    this.members.push(member)
    this.hostId ??= member.id
    this.welcome(member)
    return null
  }

  disconnect(send: Send) {
    const member = this.members.find((m) => m.send === send)
    if (!member) return
    member.send = null
    // In the lobby, leaving means leaving; mid-game the seat is kept for a reconnect.
    if (this.phase === 'lobby') this.members.splice(this.members.indexOf(member), 1)
    if (this.hostId === member.id) {
      this.hostId = this.members.find((m) => m.send)?.id ?? this.members[0]?.id ?? null
    }
    this.afterChange()
  }

  handle(send: Send, message: ClientMessage) {
    const member = this.members.find((m) => m.send === send)
    if (!member) return send({ t: 'error', message: 'Join the room first.' })
    this.lastActivity = this.now()
    const isHost = member.id === this.hostId

    switch (message.t) {
      case 'configure':
        if (!isHost || this.phase !== 'lobby') return
        this.settings = message.settings
        break
      case 'start': {
        if (!isHost || this.phase !== 'lobby') return
        const problem = this.startProblem()
        if (problem) return send({ t: 'error', message: problem })
        this.battle = battle.start({
          config: this.battleConfig(),
          seed: randomSeed(),
          now: this.now(),
          geo: this.geo,
          players: [],
        })
        this.phase = 'playing'
        break
      }
      case 'submit': {
        if (!this.battle || this.battle.rounds.round !== message.round) return
        this.step({
          type: 'submit',
          playerId: member.id,
          submission: {
            pin: message.pin,
            answerId: message.answerId,
            hintUsed: message.hintUsed,
            at: this.now(),
          },
        })
        return
      }
      case 'ready':
        if (this.battle) this.step({ type: 'ready', playerId: member.id, at: this.now() })
        return
      case 'lobby':
        if (!isHost || this.phase !== 'finished') return
        this.battle = null
        this.phase = 'lobby'
        // Players who left during the game make room for new ones.
        for (const gone of this.members.filter((m) => !m.send)) {
          this.members.splice(this.members.indexOf(gone), 1)
        }
        break
      default:
        return
    }
    this.afterChange()
  }

  /** Sends ticks so timers and bots move the game on without anyone acting. */
  tick() {
    if (this.battle) this.step({ type: 'tick', at: this.now() })
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer)
  }

  private step(event: Parameters<typeof battle.reduce>[1]) {
    if (!this.battle) return
    const next = battle.reduce(this.battle, event, this.geo)
    if (next === this.battle) return
    this.battle = next
    this.afterChange()
  }

  private afterChange() {
    const state = this.battle
    if (state) {
      // Disconnected players never hold up the reveal.
      if (state.rounds.phase === 'revealed') {
        for (const member of this.members) {
          if (!member.send && !state.ready.includes(member.id)) {
            this.battle = battle.reduce(
              this.battle!,
              { type: 'ready', playerId: member.id, at: this.now() },
              this.geo,
            )
          }
        }
      }
      if (battle.isFinished(this.battle!)) this.phase = 'finished'
    }
    this.schedule()
    this.broadcast()
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const deadline = this.battle && this.phase === 'playing' ? battle.deadline(this.battle) : null
    if (deadline === null) return
    this.timer = setTimeout(() => this.tick(), Math.max(0, deadline - this.now()))
  }

  private broadcast() {
    for (const member of this.members)
      member.send?.({ t: 'room', room: this.viewFor(member.id), serverTime: this.now() })
  }

  viewFor(playerId: string): RoomView {
    return {
      code: this.code,
      hostId: this.hostId ?? '',
      members: this.members.map((m) => ({
        id: m.id,
        name: m.name,
        color: m.color,
        connected: Boolean(m.send),
      })),
      settings: this.settings,
      phase: this.phase,
      battle: this.battle ? battleViewFor(this.battle, playerId) : null,
    }
  }

  private welcome(member: Member) {
    member.send?.({ t: 'welcome', playerId: member.id, token: member.token, code: this.code })
    this.afterChange()
  }

  private startProblem(): string | null {
    const players = this.members.length + this.settings.bots
    if (players < 2) return 'You need at least two players (add bots to play alone).'
    if (this.settings.format === 'duel' && players !== 2)
      return 'A duel is for exactly two players.'
    if (this.settings.format === 'teams' && (players < 4 || players % 2 !== 0)) {
      return 'Teams need an even number of players, at least four.'
    }
    return null
  }

  private battleConfig(): BattleConfig {
    const { format, content, bots, botSkill } = this.settings
    const humans: BattlePlayer[] = this.members.map((m) => ({
      id: m.id,
      name: m.name,
      color: m.color,
    }))
    const used = new Set(humans.map((h) => h.color))
    const colors = BOT_COLORS.filter((c) => !used.has(c))
    const robots: BattlePlayer[] = Array.from({ length: bots }, (_, i) => ({
      id: `bot-${i}`,
      name: BOT_NAMES[i],
      color: colors[i % colors.length],
      bot: botSkill,
    }))
    const roster = [...humans, ...robots]
    if (format === 'teams') roster.forEach((p, i) => (p.team = i % 2 === 0 ? 'A' : 'B'))
    return { format, content, roster }
  }

  /** Two players in the same colour would be confusing on the globe. */
  private uniqueColor(color: string): string {
    const taken = new Set(this.members.map((m) => m.color))
    if (!taken.has(color)) return color
    return BOT_COLORS.find((c) => !taken.has(c)) ?? color
  }
}
