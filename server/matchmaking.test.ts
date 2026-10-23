import { beforeEach, describe, expect, it } from 'vitest'
import type { ServerMessage } from '../src/net/protocol'
import { openDatabase, type Database } from './db'
import { loadServerGeo } from './index'
import {
  BOT_OFFER_MS,
  Matchmaker,
  MAX_RATED_PER_PAIR_PER_DAY,
  windowAt,
  type QueueEntry,
} from './matchmaking'
import { loadRating, saveRating } from './ratings'
import { Room } from './room'

const geo = loadServerGeo()
let db: Database
let clock: number
let rooms: Room[]
let matchmaker: Matchmaker

beforeEach(() => {
  db = openDatabase(':memory:')
  clock = 1_000_000
  rooms = []
  matchmaker = new Matchmaker({
    db,
    geo,
    now: () => clock,
    createRoom: () => {
      const room = new Room(
        `R${rooms.length}`,
        geo,
        () => clock,
        () => {},
      )
      rooms.push(room)
      return room
    },
  })
})

interface Client {
  entry: Omit<QueueEntry, 'joinedAt' | 'offered'>
  messages: ServerMessage[]
  room: Room | null
}

function addPlayer(id: string, rating: number | null, options: { ip?: string } = {}): Client {
  db.prepare('INSERT INTO players (id, created) VALUES (?, 0)').run(id)
  if (rating !== null) saveRating(db, id, { rating, rd: 80, vol: 0.06, games: 10 }, 0)
  const client: Client = { entry: null as never, messages: [], room: null }
  client.entry = {
    playerId: id,
    accountId: null,
    ip: options.ip ?? `10.0.0.${id.charCodeAt(0)}`,
    name: id,
    looks: { color: '#ff6b6b' },
    send: (message) => client.messages.push(message),
    matched: (room) => (client.room = room),
  }
  return client
}

const queue = (client: Client) => matchmaker.enqueue(client.entry)
const lastQueueState = (client: Client) =>
  client.messages.filter((m) => m.t === 'queue').at(-1) as Extract<ServerMessage, { t: 'queue' }>
const ratingNote = (client: Client) =>
  (client.messages.filter((m) => m.t === 'rating').at(-1) as { note: unknown } | undefined)?.note

describe('the rating window', () => {
  it('starts narrow and widens every second', () => {
    expect(windowAt(0)).toBe(100)
    expect(windowAt(10_000)).toBe(350)
    expect(windowAt(20_000)).toBe(600)
  })
})

describe('pairing', () => {
  it('matches similar ratings straight away and starts a duel with mixed rounds', () => {
    const ana = addPlayer('ana', 1500)
    const ben = addPlayer('ben', 1540)
    queue(ana)
    expect(ana.room).toBeNull()
    queue(ben)
    expect(ana.room).toBe(ben.room)
    const view = ana.room!.viewFor('p1')
    expect(view.phase).toBe('playing')
    expect(view.battle!.config).toMatchObject({ format: 'duel', content: 'mixed' })
    expect(view.members.map((m) => m.name)).toEqual(['ana', 'ben'])
    expect(matchmaker.waiting).toBe(0)
  })

  it('keeps distant ratings apart until the window has widened', () => {
    const ana = addPlayer('ana', 1500)
    const pro = addPlayer('pro', 1900)
    queue(ana)
    queue(pro)
    expect(ana.room).toBeNull()
    clock += 10_000
    matchmaker.tick()
    expect(ana.room).toBeNull()
    clock += 10_000
    matchmaker.tick()
    expect(ana.room).not.toBeNull()
    expect(ana.room).toBe(pro.room)
  })

  it('pairs a player with the closest rating, not the first in line', () => {
    const far = addPlayer('far', 1590)
    const near = addPlayer('near', 1505)
    const ana = addPlayer('ana', 1500)
    queue(far)
    queue(near)
    // far and near are within 100 of each other, so they paired already.
    expect(far.room).toBe(near.room)
    queue(ana)
    expect(ana.room).toBeNull()
  })

  it('gives a new player the starting rating', () => {
    const newcomer = addPlayer('new', null)
    queue(newcomer)
    expect(lastQueueState(newcomer).state).toMatchObject({ status: 'searching', rating: 1500 })
  })

  it('lets a player leave, and replaces a duplicate place in the queue', () => {
    const ana = addPlayer('ana', 1500)
    queue(ana)
    queue(ana)
    expect(matchmaker.waiting).toBe(1)
    matchmaker.leave('ana')
    expect(matchmaker.waiting).toBe(0)
    expect(lastQueueState(ana).state).toEqual({ status: 'idle' })
  })
})

describe('bot matches', () => {
  it('are offered after twenty seconds, and are unrated', () => {
    const ana = addPlayer('ana', 1500)
    queue(ana)
    clock += BOT_OFFER_MS - 1000
    matchmaker.tick()
    expect(lastQueueState(ana).state.status).toBe('searching')
    // Too early to accept.
    matchmaker.playBot('ana')
    expect(ana.room).toBeNull()
    clock += 1000
    matchmaker.tick()
    expect(lastQueueState(ana).state.status).toBe('offer-bot')

    matchmaker.playBot('ana')
    const view = ana.room!.viewFor('p1')
    expect(view.phase).toBe('playing')
    expect(view.battle!.config.roster.filter((p) => p.bot)).toHaveLength(1)
    expect(ratingNote(ana)).toEqual({ rated: false, rating: 1500, reason: 'bot' })
    expect(matchmaker.waiting).toBe(0)
  })

  it('can be turned down by waiting on', () => {
    const ana = addPlayer('ana', 1500)
    queue(ana)
    clock += BOT_OFFER_MS
    matchmaker.tick()
    const ben = addPlayer('ben', 1550)
    queue(ben)
    expect(ana.room).toBe(ben.room)
  })
})

describe('rating a finished match', () => {
  function playedMatch(a: Client, b: Client, report: { winners: string[]; forfeited?: string[] }) {
    queue(a)
    queue(b)
    const room = a.room!
    const ids = room.memberIds
    const idOf = (name: string) => ids[name === a.entry.playerId ? 0 : 1]
    room.onFinish!({
      winnerIds: report.winners.map(idOf),
      forfeitedIds: (report.forfeited ?? []).map(idOf),
    })
  }

  it('moves the winner up and the loser down by Glicko-2', () => {
    const ana = addPlayer('ana', 1500)
    const ben = addPlayer('ben', 1500)
    playedMatch(ana, ben, { winners: ['ana'] })
    const [a, b] = [loadRating(db, 'ana'), loadRating(db, 'ben')]
    expect(a.rating).toBeGreaterThan(1500)
    expect(b.rating).toBeLessThan(1500)
    expect(a.games).toBe(11)
    expect(ratingNote(ana)).toEqual({ rated: true, before: 1500, after: Math.round(a.rating) })
    expect(ratingNote(ben)).toMatchObject({ rated: true, before: 1500 })
  })

  it('leaves equal players where they were after a draw', () => {
    const ana = addPlayer('ana', 1500)
    const ben = addPlayer('ben', 1500)
    playedMatch(ana, ben, { winners: ['ana', 'ben'] })
    expect(loadRating(db, 'ana').rating).toBeCloseTo(1500, 3)
  })

  it('counts walking out as a loss', () => {
    const ana = addPlayer('ana', 1500)
    const ben = addPlayer('ben', 1500)
    // Ben was ahead but left and did not come back.
    playedMatch(ana, ben, { winners: ['ben'], forfeited: ['ben'] })
    expect(loadRating(db, 'ana').rating).toBeGreaterThan(1500)
    expect(loadRating(db, 'ben').rating).toBeLessThan(1500)
  })

  it('does not rate players on the same network', () => {
    const ana = addPlayer('ana', 1500, { ip: '1.2.3.4' })
    const ben = addPlayer('ben', 1500, { ip: '1.2.3.4' })
    playedMatch(ana, ben, { winners: ['ana'] })
    expect(loadRating(db, 'ana').rating).toBe(1500)
    expect(ratingNote(ana)).toEqual({ rated: false, rating: 1500, reason: 'same-network' })
  })

  it('does not rate players on the same account', () => {
    const ana = addPlayer('ana', 1500)
    const ben = addPlayer('ben', 1500)
    ana.entry.accountId = 'acc'
    ben.entry.accountId = 'acc'
    playedMatch(ana, ben, { winners: ['ana'] })
    expect(ratingNote(ben)).toMatchObject({ rated: false, reason: 'same-network' })
  })

  it('rates the same pair at most three times a day, and again the next day', () => {
    const ana = addPlayer('ana', 1500)
    const ben = addPlayer('ben', 1500)
    for (let i = 0; i < MAX_RATED_PER_PAIR_PER_DAY; i++) {
      playedMatch(ana, ben, { winners: ['ana'] })
      expect(ratingNote(ana)).toMatchObject({ rated: true })
      // Close enough that they pair again straight away.
      for (const person of [ana, ben]) person.room = null
    }
    const before = loadRating(db, 'ana').rating
    playedMatch(ana, ben, { winners: ['ana'] })
    expect(ratingNote(ana)).toMatchObject({ rated: false, reason: 'repeat-pairing' })
    expect(loadRating(db, 'ana').rating).toBe(before)

    clock += 25 * 3_600_000
    for (const person of [ana, ben]) person.room = null
    playedMatch(ana, ben, { winners: ['ana'] })
    expect(ratingNote(ana)).toMatchObject({ rated: true })
  })
})
