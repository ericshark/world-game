import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomView, ServerMessage } from '../src/net/protocol'
import { loadServerGeo } from './index'
import { Room } from './room'

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
    room.join('Ana', '#ff6b6b', undefined, ana.send)
    room.join('Ben', '#5ad1ff', undefined, ben.send)
    room.handle(ana.send, {
      t: 'configure',
      settings: { format: 'party', content, bots: 0, botSkill: 'novice' },
    })
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
    const deadline = ana.view().battle!.rounds.deadline!
    // Fire the timer, but leave the clock 1 ms short of the deadline.
    now = deadline - 1
    vi.setSystemTime(now)
    vi.advanceTimersByTime(deadline - 1_000)
    expect(ana.view().battle!.rounds.phase).toBe('open')

    advance(50)
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
})
