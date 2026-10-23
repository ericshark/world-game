import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_ROOM_SETTINGS, type RoomView, type ServerMessage } from '../src/net/protocol'
import { loadServerGeo } from './index'
import { Room, SEAT_GRACE_MS, SUBMIT_GRACE_MS } from './room'

const geo = loadServerGeo()

/** A seat in a room driven directly, with the room's clock under the test's control. */
function seat() {
  const messages: ServerMessage[] = []
  const send = (message: ServerMessage) => messages.push(message)
  const view = (): RoomView => {
    const last = messages.findLast((m) => m.t === 'room')
    if (!last || last.t !== 'room') throw new Error('no room view yet')
    return last.room
  }
  return { send, messages, view }
}

describe('room', () => {
  let now = 0
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

  function startedRoom(content: 'pinpoint' | 'mixed') {
    const errors: unknown[] = []
    const room = new Room(
      'ABCD',
      geo,
      () => now,
      (error) => errors.push(error),
    )
    const ana = seat()
    const ben = seat()
    room.join('Ana', { color: '#ff6b6b' }, undefined, ana.send)
    room.join('Ben', { color: '#5ad1ff' }, undefined, ben.send)
    room.handle(ana.send, { t: 'configure', settings: { ...DEFAULT_ROOM_SETTINGS, content } })
    room.handle(ben.send, { t: 'set-ready', ready: true })
    room.handle(ana.send, { t: 'start' })
    return { room, ana, ben, errors }
  }

  it('treats an answer naming no real country as no answer, without crashing', () => {
    const { room, ana, ben, errors } = startedRoom('mixed')
    // Mixed games rotate find, capital, name it, then Rare Earth.
    for (let round = 0; round < 3; round++) {
      room.handle(ana.send, { t: 'submit', round, pin: [0, 0] })
      room.handle(ben.send, { t: 'submit', round, pin: [0, 0] })
      room.handle(ana.send, { t: 'ready' })
      room.handle(ben.send, { t: 'ready' })
    }
    expect(ana.view().battle!.rounds.challenges[3].kind).toBe('category')

    room.guarded(() =>
      room.handle(ana.send, { t: 'submit', round: 3, answerId: 'ZZZ', pin: [0, 0] }),
    )
    room.guarded(() =>
      room.handle(ben.send, { t: 'submit', round: 3, answerId: 'FRA', pin: [2, 46] }),
    )
    expect(errors).toEqual([])
    const revealed = ana.view().battle!.rounds
    expect(revealed.phase).toBe('revealed')
    expect(revealed.results[3][ana.view().members[0].id].points).toBe(0)
  })

  it('closes a round on time even when the timer fires a moment early', () => {
    const { ana } = startedRoom('pinpoint')
    const closesAt = ana.view().battle!.rounds.deadline! + SUBMIT_GRACE_MS
    // The timer fires, but the clock reads 1 ms short of when the round closes.
    const wait = closesAt - now
    now = closesAt - SUBMIT_GRACE_MS - 1
    vi.setSystemTime(now)
    vi.advanceTimersByTime(wait)
    expect(ana.view().battle!.rounds.phase).toBe('open')

    // It waits again rather than stalling, and the round closes.
    advance(SUBMIT_GRACE_MS + 100)
    expect(ana.view().battle!.rounds.phase).toBe('revealed')
  })

  it('shows who has answered, but never the seed or their answer', () => {
    const { room, ana, ben } = startedRoom('pinpoint')
    room.handle(ana.send, { t: 'submit', round: 0, pin: [10, 10] })
    const seen = ben.view().battle!
    const anaId = ana.view().members[0].id
    expect(seen.seed).toBe('')
    expect(seen.rounds.submissions[0]).toEqual({ [anaId]: { at: now } })
  })

  it('counts an answer arriving just after the deadline, but not a late one', () => {
    const { room, ana, ben } = startedRoom('pinpoint')
    const deadline = ana.view().battle!.rounds.deadline!
    now = deadline + SUBMIT_GRACE_MS - 100
    vi.setSystemTime(now)
    room.handle(ana.send, { t: 'submit', round: 0, pin: [0, 0] })
    now = deadline + SUBMIT_GRACE_MS + 50
    vi.setSystemTime(now)
    room.handle(ben.send, { t: 'submit', round: 0, pin: [0, 0] })
    vi.advanceTimersByTime(SUBMIT_GRACE_MS + 100)
    const [anaId, benId] = ana.view().members.map((m) => m.id)
    const results = ana.view().battle!.rounds.results[0]
    expect(results[anaId].kind).toBe('locate')
    expect(results[benId].kind).toBe('missed')
  })

  describe('lobby', () => {
    function lobby() {
      const room = new Room('ABCD', geo, () => now)
      const ana = seat()
      const ben = seat()
      room.join('Ana', { color: '#ff6b6b' }, undefined, ana.send)
      room.join('Ben', { color: '#5ad1ff', shape: 'ring', title: 'speedster' }, undefined, ben.send)
      return { room, ana, ben }
    }

    it('shares each player’s looks and readiness', () => {
      const { room, ana, ben } = lobby()
      expect(ana.view().members[1]).toMatchObject({
        shape: 'ring',
        title: 'speedster',
        ready: false,
      })
      room.handle(ben.send, { t: 'set-ready', ready: true })
      expect(ana.view().members.map((m) => m.ready)).toEqual([true, true])
    })

    it('keeps a dropped player’s seat for a while, then lets it go', () => {
      const { room, ana, ben } = lobby()
      const token = (ben.messages.find((m) => m.t === 'welcome') as { token: string }).token
      room.disconnect(ben.send)
      expect(ana.view().members).toHaveLength(2)
      // Back within the grace period: the same seat.
      const again = seat()
      room.join('Ben', { color: '#5ad1ff' }, token, again.send)
      expect(ana.view().members.map((m) => m.connected)).toEqual([true, true])

      room.disconnect(again.send)
      advance(SEAT_GRACE_MS + 1_000)
      room.prune()
      expect(ana.view().members).toHaveLength(1)
    })

    it('hands hosting to someone present, and lets the host remove a player', () => {
      const { room, ana, ben } = lobby()
      room.disconnect(ana.send)
      const benId = ben.view().members[1].id
      expect(ben.view().hostId).toBe(benId)

      const carl = seat()
      room.join('Carl', { color: '#6be38a' }, undefined, carl.send)
      const carlId = ben.view().members.at(-1)!.id
      room.handle(ben.send, { t: 'kick', playerId: carlId })
      expect(carl.messages.at(-1)).toMatchObject({ t: 'error', code: 'kicked' })
      expect(ben.view().members.map((m) => m.id)).not.toContain(carlId)
    })

    it('never lets bots and people add up to more than eight', () => {
      const { room, ana } = lobby()
      room.handle(ana.send, { t: 'configure', settings: { ...DEFAULT_ROOM_SETTINGS, bots: 7 } })
      expect(ana.messages.at(-1)).toMatchObject({ t: 'error' })
      room.handle(ana.send, { t: 'configure', settings: { ...DEFAULT_ROOM_SETTINGS, bots: 6 } })
      expect(ana.view().settings.bots).toBe(6)
      expect(room.join('Dan', { color: '#ffffff' }, undefined, seat().send)).toMatch(/full/)
    })

    it('starts team games on the sides people picked, with bots evening them up', () => {
      const { room, ana, ben } = lobby()
      room.handle(ana.send, {
        t: 'configure',
        settings: { ...DEFAULT_ROOM_SETTINGS, format: 'teams', bots: 2 },
      })
      room.handle(ana.send, { t: 'team', team: 'B' })
      room.handle(ben.send, { t: 'team', team: 'B' })
      room.handle(ben.send, { t: 'set-ready', ready: true })
      room.handle(ana.send, { t: 'start' })
      const roster = ana.view().battle!.config.roster
      expect(roster.map((p) => p.team)).toEqual(['B', 'B', 'A', 'A'])
    })

    it('plays in the region and at the pace the host chose', () => {
      const { room, ana, ben } = lobby()
      room.handle(ana.send, {
        t: 'configure',
        settings: { ...DEFAULT_ROOM_SETTINGS, region: 'Europe', roundMs: 15_000 },
      })
      room.handle(ben.send, { t: 'set-ready', ready: true })
      room.handle(ana.send, { t: 'start' })
      const rounds = ana.view().battle!.rounds
      expect(rounds.deadline! - rounds.openedAt).toBe(15_000)
      const target = rounds.challenges[0]
      expect(target.kind === 'locate' && geo.feature(target.countryId).properties.region).toBe(
        'Europe',
      )
    })
  })
})
