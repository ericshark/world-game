import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_ROOM_SETTINGS,
  type RoomSettings,
  type RoomView,
  type ServerMessage,
} from '../src/net/protocol'
import { loadServerGeo } from './index'
import { Room } from './room'

// A client must never be sent anything it could use to win: the seed that makes every round and
// bot answer, rounds it has not reached, an open question's list of right answers, or another
// player's answer before the reveal. This plays every format to the end and checks every view
// every seat was sent along the way.

const geo = loadServerGeo()

function seat() {
  const messages: ServerMessage[] = []
  return { send: (message: ServerMessage) => messages.push(message), messages }
}

const VARIETIES: { name: string; settings: Partial<RoomSettings> }[] = [
  { name: 'duel with find-it rounds', settings: { format: 'duel', content: 'pinpoint' } },
  { name: 'duel with mixed rounds', settings: { format: 'duel', content: 'mixed' } },
  { name: 'party with mixed rounds', settings: { format: 'party', content: 'mixed', bots: 1 } },
  {
    name: 'survival with mixed rounds',
    settings: { format: 'survival', content: 'mixed', bots: 1 },
  },
  { name: 'teams with mixed rounds', settings: { format: 'teams', content: 'mixed', bots: 2 } },
]

describe('what a client is sent', () => {
  let now = 1_000
  beforeEach(() => {
    now = 1_000
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })
  afterEach(() => vi.useRealTimers())

  const advance = (ms: number) => {
    now += ms
    vi.setSystemTime(now)
    vi.advanceTimersByTime(ms)
  }

  it.each(VARIETIES)('is safe in a $name', ({ settings }) => {
    const room = new Room(
      'SAFE5',
      geo,
      () => now,
      () => {},
    )
    const ana = seat()
    const ben = seat()
    room.join('Ana', { color: '#ff6b6b' }, undefined, ana.send)
    room.join('Ben', { color: '#5ad1ff' }, undefined, ben.send)
    room.handle(ana.send, { t: 'configure', settings: { ...DEFAULT_ROOM_SETTINGS, ...settings } })
    room.handle(ben.send, { t: 'set-ready', ready: true })
    if (settings.format === 'teams') {
      room.handle(ana.send, { t: 'team', team: 'A' })
      room.handle(ben.send, { t: 'team', team: 'B' })
    }
    room.handle(ana.send, { t: 'start' })
    const secret = (room as unknown as { battle: { seed: string } }).battle.seed
    expect(secret.length).toBeGreaterThan(0)

    const idOf = (messages: ServerMessage[]) =>
      (messages.find((m) => m.t === 'welcome') as { playerId: string }).playerId
    const [anaId, benId] = [idOf(ana.messages), idOf(ben.messages)]
    const seen = new Set<string>()
    const check = () => {
      for (const { messages, viewerId } of [
        { messages: ana.messages, viewerId: anaId },
        { messages: ben.messages, viewerId: benId },
      ]) {
        for (const message of messages.splice(0)) {
          if (message.t !== 'room' || !message.room.battle) continue
          const text = JSON.stringify(message.room)
          expect(text).not.toContain(secret)
          const view: RoomView['battle'] = message.room.battle
          expect(view!.seed).toBe('')
          const { rounds } = view!
          // Only rounds reached so far are sent.
          expect(rounds.challenges.length).toBeLessThanOrEqual(rounds.round + 1)
          if (rounds.phase === 'open') {
            const current = rounds.challenges[rounds.round]
            if (current.kind === 'category') {
              expect(current.category.valid).toEqual([])
              expect(current.category.lenient).toEqual([])
            }
            // Others' answers show only that they were given.
            for (const [id, submission] of Object.entries(rounds.submissions[rounds.round])) {
              if (id !== viewerId) expect(Object.keys(submission)).toEqual(['at'])
            }
          }
          seen.add(`${rounds.round}:${rounds.phase}`)
        }
      }
    }

    // Everyone answers the first round (so secrets exist to leak), then time does the rest.
    const roundMs = settings.roundMs ?? DEFAULT_ROOM_SETTINGS.roundMs
    check()
    room.handle(ana.send, { t: 'submit', round: 0, pin: [10, 10] })
    check()
    for (let step = 0; step < 60 && room.phase !== 'finished'; step++) {
      advance(roundMs / 2)
      check()
    }
    check()
    expect(seen.size).toBeGreaterThan(3)
  })

  it('never shows one player another’s pin before the reveal', () => {
    const room = new Room(
      'SAFE5',
      geo,
      () => now,
      () => {},
    )
    const ana = seat()
    const ben = seat()
    room.join('Ana', { color: '#ff6b6b' }, undefined, ana.send)
    room.join('Ben', { color: '#5ad1ff' }, undefined, ben.send)
    room.handle(ben.send, { t: 'set-ready', ready: true })
    room.handle(ana.send, { t: 'start' })
    room.handle(ana.send, { t: 'submit', round: 0, pin: [12.5, 34.5] })
    const lastForBen = ben.messages.findLast((m) => m.t === 'room')
    expect(JSON.stringify(lastForBen)).not.toContain('12.5')
    const lastForAna = ana.messages.findLast((m) => m.t === 'room')
    expect(JSON.stringify(lastForAna)).toContain('12.5')
  })
})
