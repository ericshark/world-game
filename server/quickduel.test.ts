import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import type { ServerMessage } from '../src/net/protocol'
import { DevMailer } from './auth/mail'
import { loadConfig } from './config'
import { loadServerGeo, startServer, type RunningServer } from './index'
import { testBrowser } from './testBrowser'

const geo = loadServerGeo()
let server: RunningServer
let dir: string
let clock: number

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wg-duel-'))
  clock = Date.now()
  server = await startServer({
    config: loadConfig(
      {},
      { port: 0, host: '127.0.0.1', databasePath: join(dir, 'test.sqlite'), distDir: null },
    ),
    geo,
    now: () => clock,
    mailer: new DevMailer(() => {}),
  })
})

afterEach(async () => {
  await server.close()
  rmSync(dir, { recursive: true, force: true })
})

/** A player with a real session, connected to the realtime socket with their cookie. */
async function connect(withSession = true) {
  const person = testBrowser(server)
  if (withSession) await person.request('/api/session', { body: {} })
  const cookie = [...person.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, { headers: { cookie } })
  const messages: ServerMessage[] = []
  socket.on('message', (data) => messages.push(JSON.parse(data.toString())))
  await new Promise((resolve) => socket.once('open', resolve))
  const until = async (test: (m: ServerMessage) => boolean) => {
    for (let i = 0; i < 100; i++) {
      const found = messages.find(test)
      if (found) return found
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error('timed out waiting for a message')
  }
  return { socket, messages, until, send: (m: object) => socket.send(JSON.stringify(m)) }
}

const queueMessage = (name: string) => ({ t: 'queue', name, color: '#ff6b6b' })

describe('Quick Duel over the socket', () => {
  it('needs a session', async () => {
    const stranger = await connect(false)
    stranger.send(queueMessage('Nobody'))
    const error = await stranger.until((m) => m.t === 'error')
    expect(error).toMatchObject({ message: 'Start a session first.' })
  })

  it('puts two players in a room with a duel already running', async () => {
    const ana = await connect()
    const ben = await connect()
    ana.send(queueMessage('Ana'))
    await ana.until((m) => m.t === 'queue' && m.state.status === 'searching')
    ben.send(queueMessage('Ben'))
    for (const player of [ana, ben]) {
      await player.until((m) => m.t === 'welcome')
      const room = await player.until((m) => m.t === 'room' && m.room.phase === 'playing')
      expect(room).toMatchObject({ room: { battle: { config: { format: 'duel' } } } })
    }
    ana.socket.close()
    ben.socket.close()
  })

  it('lets a waiting player leave the queue, and offers a bot after a wait', async () => {
    const ana = await connect()
    ana.send(queueMessage('Ana'))
    await ana.until((m) => m.t === 'queue' && m.state.status === 'searching')
    ana.send({ t: 'queue-leave' })
    await ana.until((m) => m.t === 'queue' && m.state.status === 'idle')

    const mark = ana.messages.length
    ana.send(queueMessage('Ana'))
    await ana.until(
      (m) => m.t === 'queue' && m.state.status === 'searching' && ana.messages.indexOf(m) >= mark,
    )
    clock += 21_000
    await ana.until((m) => m.t === 'queue' && m.state.status === 'offer-bot')
    ana.send({ t: 'queue-bot' })
    const room = await ana.until((m) => m.t === 'room' && m.room.phase === 'playing')
    expect(room).toMatchObject({
      room: { battle: { config: { roster: [{ name: 'Ana' }, { bot: 'explorer' }] } } },
    })
    ana.socket.close()
  })

  it('removes a player who disconnects from the queue', async () => {
    const ana = await connect()
    ana.send(queueMessage('Ana'))
    await ana.until((m) => m.t === 'queue')
    ana.socket.close()
    await new Promise((resolve) => setTimeout(resolve, 100))
    const ben = await connect()
    ben.send(queueMessage('Ben'))
    await ben.until((m) => m.t === 'queue')
    await new Promise((resolve) => setTimeout(resolve, 1200))
    // Ben is still waiting: Ana's seat in the queue is gone, so there is nobody to match.
    expect(ben.messages.some((m) => m.t === 'welcome')).toBe(false)
    ben.socket.close()
  })
})
