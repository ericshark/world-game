import type { Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import type { GeoData } from '../src/geo/facts'
import { parseClientMessage, ROOM_CODE_LENGTH, type ServerMessage } from '../src/net/protocol'
import { Room } from './room'

const MAX_MESSAGE_BYTES = 4096
/** Each connection may send this many messages a second, with short bursts allowed. */
const MESSAGES_PER_SECOND = 10
const BURST = 20
const IDLE_ROOM_MS = 30 * 60_000
/** Sockets that miss a heartbeat are dead (a phone that lost signal, say) and are dropped. */
const HEARTBEAT_MS = 15_000
const SWEEP_MS = 5_000
// No I or O: codes are read aloud and typed on phones.
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

export interface Realtime {
  roomCount(): number
  close(): void
}

/** The WebSocket side: upgrades `/ws` on the HTTP server and routes messages to rooms. */
export function attachRealtime(http: Server, geo: GeoData): Realtime {
  const rooms = new Map<string, Room>()
  const sockets = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_MESSAGE_BYTES })

  const alive = new WeakSet<WebSocket>()
  const heartbeat = setInterval(() => {
    for (const client of sockets.clients) {
      if (!alive.has(client)) {
        client.terminate()
        continue
      }
      alive.delete(client)
      client.ping()
    }
  }, HEARTBEAT_MS)

  sockets.on('connection', (socket: WebSocket) => {
    alive.add(socket)
    socket.on('pong', () => alive.add(socket))
    let room: Room | null = null
    let tokens = BURST
    let refilledAt = Date.now()
    const send = (message: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
    }

    socket.on('message', (data) => {
      const now = Date.now()
      tokens = Math.min(BURST, tokens + ((now - refilledAt) / 1000) * MESSAGES_PER_SECOND)
      refilledAt = now
      if (tokens < 1) return send({ t: 'error', message: 'Slow down.' })
      tokens -= 1

      const message = parseClientMessage(data.toString())
      if (!message) return send({ t: 'error', message: 'Unrecognised message.' })

      if (message.t === 'ping') {
        return send({ t: 'pong', sentAt: message.sentAt, serverTime: Date.now() })
      }
      if (message.t === 'create' || message.t === 'join') {
        const target = message.t === 'create' ? createRoom(rooms, geo) : rooms.get(message.code)
        if (!target) {
          return send({ t: 'error', message: 'No room with that code.', code: 'no-room' })
        }
        const token = message.t === 'join' ? message.token : undefined
        const looks = { color: message.color, shape: message.shape, title: message.title }
        const problem = target.join(message.name, looks, token, send)
        // A failed join keeps the seat this player already has.
        if (problem) return send({ t: 'error', message: problem })
        if (room && room !== target) room.disconnect(send)
        room = target
        return
      }
      const current = room
      current?.guarded(() => current.handle(send, message))
    })

    socket.on('close', () => room?.disconnect(send))
    // Dropped connections (closed tabs, sleeping phones) reset sockets; 'close' handles them.
    socket.on('error', () => {})
  })

  // Lobby seats left empty too long are freed, and rooms nobody has used for a while close.
  const sweeper = setInterval(() => {
    for (const [code, room] of rooms) {
      room.guarded(() => room.prune())
      if (room.connectedCount === 0 && Date.now() - room.lastActivity > IDLE_ROOM_MS) {
        room.dispose()
        rooms.delete(code)
      }
    }
  }, SWEEP_MS)

  return {
    roomCount: () => rooms.size,
    close() {
      clearInterval(sweeper)
      clearInterval(heartbeat)
      for (const room of rooms.values()) {
        room.notifyRestart()
        room.dispose()
      }
      for (const client of sockets.clients) client.terminate()
      sockets.close()
    },
  }
}

function createRoom(rooms: Map<string, Room>, geo: GeoData): Room {
  let code: string
  do {
    code = Array.from(
      { length: ROOM_CODE_LENGTH },
      () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)],
    ).join('')
  } while (rooms.has(code))
  const room = new Room(code, geo)
  rooms.set(code, room)
  return room
}
