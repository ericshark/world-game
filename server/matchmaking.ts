import type { GeoData } from '../src/geo/facts'
import type { BotSkill } from '../src/game/modes/bots'
import type {
  Looks,
  QueueState,
  RatingNote,
  RoomSettings,
  ServerMessage,
} from '../src/net/protocol'
import { updateRating } from './glicko2'
import type { Database } from './db'
import {
  loadRating,
  ratedGamesBetween,
  recordMatch,
  saveRating,
  type StoredRating,
} from './ratings'
import { Room, type MatchReport } from './room'

type Send = (message: ServerMessage) => void

/** The rating gap a waiting player accepts starts here and widens every second. */
export const BASE_WINDOW = 100
export const WINDOW_GROWTH_PER_SECOND = 25
/** After this long without an opponent, a bot match is offered. */
export const BOT_OFFER_MS = 20_000
/** A pair of players may play each other for rating this often in a day. */
export const MAX_RATED_PER_PAIR_PER_DAY = 3
const DAY_MS = 86_400_000

export const QUICK_DUEL_SETTINGS: RoomSettings = {
  format: 'duel',
  content: 'mixed',
  bots: 0,
  botSkill: 'traveller',
  region: 'World',
  roundMs: 25_000,
}

export interface QueueEntry {
  playerId: string
  accountId: string | null
  ip: string
  name: string
  looks: Looks
  send: Send
  /** Tells the connection which room it is in now. */
  matched: (room: Room) => void
  joinedAt: number
  offered: boolean
}

export function windowAt(waitedMs: number): number {
  return BASE_WINDOW + Math.floor(waitedMs / 1000) * WINDOW_GROWTH_PER_SECOND
}

function botSkillFor(rating: number): BotSkill {
  if (rating < 1300) return 'novice'
  if (rating < 1500) return 'traveller'
  if (rating < 1700) return 'explorer'
  return 'cartographer'
}

interface Seat {
  entry: QueueEntry
  memberId: string
}

/**
 * The public Quick Duel queue. Players wait for someone of a similar rating (the range widens
 * the longer they wait), or after a while may play a labelled, unrated bot. Finished human
 * matches update both players' Glicko-2 ratings, unless the pairing cannot be trusted.
 */
export class Matchmaker {
  private readonly queue: QueueEntry[] = []
  private readonly db: Database
  private readonly now: () => number
  private readonly createRoom: () => Room | null
  private readonly onPair?: () => void
  private readonly ratingOf = new Map<string, StoredRating>()

  constructor(deps: {
    db: Database
    geo: GeoData
    now: () => number
    createRoom: () => Room | null
    onPair?: () => void
  }) {
    this.db = deps.db
    this.now = deps.now
    this.createRoom = deps.createRoom
    this.onPair = deps.onPair
  }

  get waiting(): number {
    return this.queue.length
  }

  enqueue(entry: Omit<QueueEntry, 'joinedAt' | 'offered'>) {
    // One place in the queue per player: a second tab replaces the first.
    this.leave(entry.playerId)
    const full = { ...entry, joinedAt: this.now(), offered: false }
    this.queue.push(full)
    this.ratingOf.set(entry.playerId, loadRating(this.db, entry.playerId))
    this.tell(full, 'searching')
    this.tick()
  }

  leave(playerId: string, notify = true) {
    const index = this.queue.findIndex((e) => e.playerId === playerId)
    if (index < 0) return
    const [gone] = this.queue.splice(index, 1)
    this.ratingOf.delete(gone.playerId)
    if (notify) gone.send({ t: 'queue', state: { status: 'idle' } })
  }

  /** Removes a connection that closed, without messaging it. */
  drop(send: Send) {
    const entry = this.queue.find((e) => e.send === send)
    if (entry) this.leave(entry.playerId, false)
  }

  /** Pairs up whoever can be paired, and offers a bot to those who have waited long enough. */
  tick() {
    const now = this.now()
    const unmatched = [...this.queue].sort((a, b) => a.joinedAt - b.joinedAt)
    for (const entry of unmatched) {
      if (!this.queue.includes(entry)) continue
      const mine = this.rating(entry)
      const waited = now - entry.joinedAt
      let best: QueueEntry | null = null
      for (const other of this.queue) {
        if (other === entry) continue
        const gap = Math.abs(this.rating(other) - mine)
        const reach = Math.max(windowAt(waited), windowAt(now - other.joinedAt))
        if (gap <= reach && (!best || gap < Math.abs(this.rating(best) - mine))) best = other
      }
      if (best) {
        this.pair(entry, best)
      } else if (waited >= BOT_OFFER_MS && !entry.offered) {
        entry.offered = true
        this.tell(entry, 'offer-bot')
      } else if (waited > 0) {
        this.tell(entry, entry.offered ? 'offer-bot' : 'searching')
      }
    }
  }

  /** Plays a bot instead of waiting (unrated). */
  playBot(playerId: string) {
    const entry = this.queue.find((e) => e.playerId === playerId)
    if (!entry || !entry.offered) return
    const room = this.createRoom()
    if (!room) {
      entry.send({ t: 'error', message: 'The server is full. Try again later.' })
      return
    }
    const rating = this.rating(entry)
    this.leave(playerId, false)
    if (this.seat(room, entry)) return
    room.startMatch({ ...QUICK_DUEL_SETTINGS, bots: 1, botSkill: botSkillFor(rating) })
    entry.send({ t: 'rating', note: { rated: false, rating: Math.round(rating), reason: 'bot' } })
    // The note is sent up front so it is there when the results appear.
  }

  private rating(entry: QueueEntry): number {
    return this.ratingOf.get(entry.playerId)?.rating ?? 1500
  }

  private tell(entry: QueueEntry, status: 'searching' | 'offer-bot') {
    const state: QueueState = {
      status,
      waitedMs: this.now() - entry.joinedAt,
      rating: Math.round(this.rating(entry)),
    }
    entry.send({ t: 'queue', state })
  }

  /** Joins a queued player to the room; true if that failed. */
  private seat(room: Room, entry: QueueEntry): boolean {
    const problem = room.join(entry.name, entry.looks, undefined, entry.send)
    if (problem) {
      entry.send({ t: 'error', message: problem })
      return true
    }
    entry.matched(room)
    return false
  }

  private pair(a: QueueEntry, b: QueueEntry) {
    const room = this.createRoom()
    if (!room) return
    this.leave(a.playerId, false)
    this.leave(b.playerId, false)
    if (this.seat(room, a) || this.seat(room, b)) return
    this.onPair?.()
    const [idA, idB] = room.memberIds
    const seats: [Seat, Seat] = [
      { entry: a, memberId: idA },
      { entry: b, memberId: idB },
    ]
    const untrusted = this.untrustedReason(a, b)
    room.onFinish = (report) => this.finish(seats, report, untrusted)
    room.startMatch(QUICK_DUEL_SETTINGS)
  }

  /** Pairings that must not move ratings: one person on two seats, or farming the same rival. */
  private untrustedReason(a: QueueEntry, b: QueueEntry): 'same-network' | 'repeat-pairing' | null {
    if (
      a.playerId === b.playerId ||
      a.ip === b.ip ||
      (a.accountId !== null && a.accountId === b.accountId)
    ) {
      return 'same-network'
    }
    const recent = ratedGamesBetween(this.db, a.playerId, b.playerId, this.now() - DAY_MS)
    return recent >= MAX_RATED_PER_PAIR_PER_DAY ? 'repeat-pairing' : null
  }

  private finish(
    [a, b]: [Seat, Seat],
    report: MatchReport,
    untrusted: 'same-network' | 'repeat-pairing' | null,
  ) {
    // Walking out of a game loses it; otherwise the standings decide, shared on a draw.
    const forfeitA = report.forfeitedIds.includes(a.memberId)
    const forfeitB = report.forfeitedIds.includes(b.memberId)
    const scoreA =
      forfeitA !== forfeitB
        ? forfeitA
          ? 0
          : 1
        : report.winnerIds.length === 2 || report.winnerIds.length === 0
          ? 0.5
          : report.winnerIds[0] === a.memberId
            ? 1
            : 0
    const before = [loadRating(this.db, a.entry.playerId), loadRating(this.db, b.entry.playerId)]
    const now = this.now()

    if (untrusted) {
      recordMatch(
        this.db,
        {
          playerA: a.entry.playerId,
          playerB: b.entry.playerId,
          scoreA,
          rated: false,
          reason: untrusted,
        },
        now,
      )
      for (const [seat, rating] of [
        [a, before[0]],
        [b, before[1]],
      ] as const) {
        const note: RatingNote = {
          rated: false,
          rating: Math.round(rating.rating),
          reason: untrusted,
        }
        seat.entry.send({ t: 'rating', note })
      }
      return
    }

    const next = [
      updateRating(before[0], [{ opponent: before[1], score: scoreA }]),
      updateRating(before[1], [{ opponent: before[0], score: 1 - scoreA }]),
    ]
    this.db.exec('BEGIN')
    try {
      saveRating(this.db, a.entry.playerId, { ...next[0], games: before[0].games + 1 }, now)
      saveRating(this.db, b.entry.playerId, { ...next[1], games: before[1].games + 1 }, now)
      recordMatch(
        this.db,
        { playerA: a.entry.playerId, playerB: b.entry.playerId, scoreA, rated: true },
        now,
      )
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    ;[a, b].forEach((seat, i) => {
      const note: RatingNote = {
        rated: true,
        before: Math.round(before[i].rating),
        after: Math.round(next[i].rating),
      }
      seat.entry.send({ t: 'rating', note })
    })
  }
}
