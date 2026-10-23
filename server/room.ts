import type { GeoData } from '../src/geo/facts'
import {
  battle,
  battleViewFor,
  standings,
  type BattleConfig,
  type BattlePlayer,
  type BattleState,
  type Team,
} from '../src/game/modes/battle'
import { randomSeed } from '../src/game/core/random'
import {
  DEFAULT_ROOM_SETTINGS,
  MAX_PLAYERS,
  type ClientMessage,
  type Looks,
  type RoomSettings,
  type RoomView,
  type ServerMessage,
} from '../src/net/protocol'

type Send = (message: ServerMessage) => void

/** How a game that someone is waiting on ended, for rating it. Member ids are the room's. */
export interface MatchReport {
  /** The people who came first (more than one for a draw). */
  winnerIds: string[]
  /** People who left and did not return within the grace period. */
  forfeitedIds: string[]
}

interface Member extends Looks {
  id: string
  name: string
  /** Secret that lets a player reconnect as themselves. */
  token: string
  send: Send | null
  /** When the connection dropped, for holding the seat a while. */
  leftAt: number | null
  ready: boolean
  team?: Team
}

/** A dropped player keeps their place in the lobby this long, for a reconnect. */
export const SEAT_GRACE_MS = 30_000
/** Answers arriving this soon after the deadline still count: they were sent in time. */
export const SUBMIT_GRACE_MS = 500
/** Never wait less than this for a deadline, so an overdue one cannot spin the CPU. */
const MIN_WAIT_MS = 5

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
  /** Called once when the first game ends; used by matchmaking to rate it. */
  onFinish: ((report: MatchReport) => void) | null = null
  private readonly members: Member[] = []
  private battle: BattleState | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private nextId = 1

  private readonly geo: GeoData
  private readonly now: () => number
  private readonly onError: (error: unknown) => void

  constructor(
    code: string,
    geo: GeoData,
    now: () => number = Date.now,
    onError: (error: unknown) => void = (error) => console.error(`Room ${code}:`, error),
  ) {
    this.code = code
    this.geo = geo
    this.now = now
    this.onError = onError
    this.lastActivity = now()
  }

  get connectedCount(): number {
    return this.members.filter((m) => m.send).length
  }

  /** Adds a player, or reconnects one by token. Returns an error message on failure. */
  join(name: string, looks: Looks, token: string | undefined, send: Send) {
    this.lastActivity = this.now()
    this.prune()
    const returning = token ? this.members.find((m) => m.token === token) : undefined
    if (returning) {
      // A second tab with the same seat takes it over; the first is told it has moved.
      if (returning.send && returning.send !== send) {
        returning.send({ t: 'error', message: 'You joined this room from another tab.' })
      }
      Object.assign(returning, { send, name, leftAt: null }, looks)
      this.welcome(returning)
      return null
    }
    if (this.phase !== 'lobby') return 'This game has already started.'
    if (this.members.length + this.settings.bots >= MAX_PLAYERS) return 'This room is full.'
    const member: Member = {
      id: `p${this.nextId++}`,
      name,
      ...looks,
      color: this.uniqueColor(looks.color),
      token: randomSeed() + randomSeed(),
      send,
      leftAt: null,
      ready: false,
    }
    this.members.push(member)
    this.hostId ??= member.id
    this.welcome(member)
    return null
  }

  /** The connection dropped: the seat is kept for a while (in a game, until it ends). */
  disconnect(send: Send) {
    const member = this.members.find((m) => m.send === send)
    if (!member) return
    member.send = null
    member.leftAt = this.now()
    member.ready = false
    this.afterChange()
  }

  handle(send: Send, message: ClientMessage) {
    const member = this.members.find((m) => m.send === send)
    if (!member) return send({ t: 'error', message: 'Join the room first.' })
    this.lastActivity = this.now()
    const isHost = member.id === this.hostId
    const inLobby = this.phase === 'lobby'

    switch (message.t) {
      case 'configure': {
        if (!isHost || !inLobby) return
        if (this.members.length + message.settings.bots > MAX_PLAYERS) {
          return send({ t: 'error', message: `At most ${MAX_PLAYERS} players, bots included.` })
        }
        this.settings = message.settings
        break
      }
      case 'set-ready':
        if (!inLobby) return
        member.ready = message.ready
        break
      case 'team':
        if (!inLobby) return
        member.team = message.team
        break
      case 'kick': {
        const target = this.members.find((m) => m.id === message.playerId)
        if (!isHost || !target || target === member) return
        target.send?.({
          t: 'error',
          message: 'The host removed you from the room.',
          code: 'kicked',
        })
        if (inLobby) {
          this.members.splice(this.members.indexOf(target), 1)
        } else {
          // Mid-game the seat stays in the scores, but nobody can play from it again.
          Object.assign(target, { send: null, leftAt: this.now(), token: randomSeed() })
        }
        break
      }
      case 'leave':
        if (inLobby) this.members.splice(this.members.indexOf(member), 1)
        else Object.assign(member, { send: null, leftAt: this.now() })
        break
      case 'start': {
        if (!isHost || !inLobby) return
        const problem = this.startProblem()
        if (problem) return send({ t: 'error', message: problem })
        this.begin()
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
            at: this.submittedAt(),
          },
        })
        return
      }
      case 'ready':
        if (this.battle) this.step({ type: 'ready', playerId: member.id, at: this.now() })
        return
      case 'lobby':
        // Anyone can call everyone back for another game.
        if (this.phase !== 'finished') return
        this.battle = null
        this.phase = 'lobby'
        for (const m of this.members) m.ready = false
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

  /** Ids of the people in the room, in the order they joined. */
  get memberIds(): string[] {
    return this.members.map((m) => m.id)
  }

  /** Starts a game straight away with these settings, for matches made by the queue. */
  startMatch(settings: RoomSettings) {
    this.settings = settings
    this.guarded(() => {
      this.begin()
      this.afterChange()
    })
  }

  private begin() {
    this.battle = battle.start({
      config: this.battleConfig(),
      seed: randomSeed(),
      now: this.now(),
      geo: this.geo,
      players: [],
    })
    this.phase = 'playing'
  }

  /** Sends ticks so timers and bots move the game on without anyone acting. */
  tick() {
    if (this.battle) this.guarded(() => this.step({ type: 'tick', at: this.now() }))
  }

  /** Drops lobby seats whose players have been gone longer than the grace period. */
  prune() {
    if (this.phase !== 'lobby') return
    const expired = this.members.filter(
      (m) => !m.send && m.leftAt !== null && this.now() - m.leftAt > SEAT_GRACE_MS,
    )
    if (expired.length === 0) return
    for (const gone of expired) this.members.splice(this.members.indexOf(gone), 1)
    this.afterChange()
  }

  /** Tells everyone the server is going away for a moment. */
  notifyRestart() {
    for (const member of this.members) {
      member.send?.({
        t: 'error',
        message: 'The server is restarting. Reconnecting…',
        code: 'restarting',
      })
    }
  }

  /**
   * Runs a change to the game. A bug in the rules must not take down the whole server, so a
   * failure is logged, and the room carries on with its last good state.
   */
  guarded(change: () => void) {
    try {
      change()
    } catch (error) {
      this.onError(error)
      this.schedule()
    }
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer)
  }

  /** An answer that arrives just after the deadline was sent in time, so it counts as on time. */
  private submittedAt(): number {
    const now = this.now()
    const deadline = this.battle?.rounds.deadline ?? null
    return deadline !== null && now > deadline && now - deadline <= SUBMIT_GRACE_MS ? deadline : now
  }

  private step(event: Parameters<typeof battle.reduce>[1]) {
    if (!this.battle) return
    const next = battle.reduce(this.battle, event, this.geo)
    if (next === this.battle) {
      // A timer can fire a moment before its deadline; nothing is due yet, so wait again.
      this.schedule()
      return
    }
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
      if (battle.isFinished(this.battle!) && this.phase !== 'finished') {
        this.phase = 'finished'
        this.reportFinish()
      }
    }
    this.electHost()
    this.assignSides()
    this.schedule()
    this.broadcast()
  }

  private reportFinish() {
    const report = this.onFinish
    this.onFinish = null
    if (!report || !this.battle) return
    const humans = new Set(this.members.map((m) => m.id))
    report({
      winnerIds: standings(this.battle)
        .filter((s) => s.place === 1 && humans.has(s.id))
        .map((s) => s.id),
      forfeitedIds: this.members
        .filter((m) => !m.send && m.leftAt !== null && this.now() - m.leftAt > SEAT_GRACE_MS)
        .map((m) => m.id),
    })
  }

  /** In a team game everyone is always on a side: the smaller one, until they pick. */
  private assignSides() {
    if (this.phase !== 'lobby' || this.settings.format !== 'teams') return
    for (const member of this.members) {
      if (member.team) continue
      const sizes = teamSizes(this.members.flatMap((m) => (m.team ? [m.team] : [])))
      member.team = sizes.A <= sizes.B ? 'A' : 'B'
    }
  }

  /** The host is always someone who is here, if anyone is. */
  private electHost() {
    const host = this.members.find((m) => m.id === this.hostId)
    if (host?.send) return
    const present = this.members.find((m) => m.send)
    this.hostId = present?.id ?? host?.id ?? this.members[0]?.id ?? null
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const deadline = this.battle && this.phase === 'playing' ? battle.deadline(this.battle) : null
    if (deadline === null) return
    // The grace lets answers sent just before the deadline arrive before the round closes.
    const wait = deadline + SUBMIT_GRACE_MS - this.now()
    this.timer = setTimeout(() => this.tick(), Math.max(MIN_WAIT_MS, wait))
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
        shape: m.shape,
        title: m.title,
        connected: Boolean(m.send),
        ready: m.ready || m.id === this.hostId,
        team: m.team,
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
    const { format, bots } = this.settings
    const players = this.members.length + bots
    if (players < 2) return 'You need at least two players (add bots to play alone).'
    if (players > MAX_PLAYERS) return `At most ${MAX_PLAYERS} players, bots included.`
    if (format === 'duel' && players !== 2) return 'A duel is for exactly two players.'
    const waiting = this.members.filter((m) => m.id !== this.hostId && (!m.send || !m.ready))
    if (waiting.length > 0) {
      return `Waiting for ${waiting.map((m) => m.name).join(', ')} to be ready.`
    }
    if (format === 'teams') {
      const sizes = teamSizes(this.teams())
      if (sizes.A !== sizes.B || sizes.A < 2) {
        return 'Teams need the same number on each side, at least two: change sides or bots.'
      }
    }
    return null
  }

  /** Each person's side: their pick, or the smaller side. Bots then fill the smaller side. */
  private teams(): Team[] {
    const sides: Team[] = []
    for (const member of this.members) {
      const sizes = teamSizes(sides)
      sides.push(member.team ?? (sizes.A <= sizes.B ? 'A' : 'B'))
    }
    for (let i = 0; i < this.settings.bots; i++) {
      const sizes = teamSizes(sides)
      sides.push(sizes.A <= sizes.B ? 'A' : 'B')
    }
    return sides
  }

  private battleConfig(): BattleConfig {
    const { format, content, bots, botSkill, region, roundMs } = this.settings
    const humans: BattlePlayer[] = this.members.map((m) => ({
      id: m.id,
      name: m.name,
      color: m.color,
      shape: m.shape,
      title: m.title,
    }))
    const used = new Set(humans.map((h) => h.color))
    const colors = BOT_COLORS.filter((c) => !used.has(c))
    const robots: BattlePlayer[] = Array.from({ length: bots }, (_, i) => ({
      id: `bot-${i}`,
      name: BOT_NAMES[i],
      // With every bot colour taken by people, bots share them rather than going colourless.
      color: colors.length > 0 ? colors[i % colors.length] : BOT_COLORS[i % BOT_COLORS.length],
      bot: botSkill,
    }))
    const roster = [...humans, ...robots]
    if (format === 'teams') {
      const sides = this.teams()
      roster.forEach((p, i) => (p.team = sides[i]))
    }
    return { format, content, roster, region, roundMs }
  }

  /** Two players in the same colour would be confusing on the globe. */
  private uniqueColor(color: string): string {
    const taken = new Set(this.members.map((m) => m.color))
    if (!taken.has(color)) return color
    return BOT_COLORS.find((c) => !taken.has(c)) ?? color
  }
}

function teamSizes(sides: Team[]) {
  return {
    A: sides.filter((side) => side === 'A').length,
    B: sides.filter((side) => side === 'B').length,
  }
}
