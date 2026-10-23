import type { IncomingMessage, Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import type { GeoData } from '../src/geo/facts'
import { parseClientMessage, ROOM_CODE_LENGTH, type ServerMessage } from '../src/net/protocol'
import { AuthStore, type PlayerRow } from './auth/store'
import type { Database } from './db'
import { Matchmaker } from './matchmaking'
import type { ServerConfig } from './config'
import { RateLimiter } from './auth/rateLimit'
import { Room } from './room'
import { clientIp, originAllowed } from './security'

const SESSION_COOKIE = 'wg_session'
const MATCH_TICK_MS = 1000

const MAX_MESSAGE_BYTES = 4096
/** Each connection may send this many messages a second, with short bursts allowed. */
const MESSAGES_PER_SECOND = 10
const BURST = 20
/** How often a connection is told "Slow down"; the messages beyond that are dropped silently. */
const WARN_EVERY_MS = 2000
/** A connection that keeps flooding after being told is closed. */
const MAX_DROPPED_PER_WINDOW = 200
const DROPPED_WINDOW_MS = 10_000
/** Limits on what one address may hold open or start. */
export const MAX_CONNECTIONS_PER_IP = 30
export const MAX_ROOMS_PER_IP_PER_10_MIN = 20
export const MAX_OPEN_ROOMS = 1000
/** Wrong room codes tried per minute, so codes cannot be guessed by counting through them. */
export const MAX_FAILED_JOINS_PER_MINUTE = 10
const IDLE_ROOM_MS = 30 * 60_000
/** Sockets that miss a heartbeat are dead (a phone that lost signal, say) and are dropped. */
const HEARTBEAT_MS = 15_000
const SWEEP_MS = 5_000
// No I or O: codes are read aloud and typed on phones.
/** Addresses of the app's own screens that look like room codes. */
const RESERVED_CODES = new Set(['QUICK'])
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

export interface Realtime {
  roomCount(): number
  stats(): { rooms: number; sockets: number; queued: number }
  close(): void
}

/** The WebSocket side: upgrades `/ws` on the HTTP server and routes messages to rooms. */
export function attachRealtime(
  http: Server,
  geo: GeoData,
  { db, config, now = Date.now }: { db: Database; config: ServerConfig; now?: () => number },
): Realtime {
  const rooms = new Map<string, Room>()
  const store = new AuthStore(db, now)
  const matchmaker = new Matchmaker({ db, geo, now, createRoom: () => createRoom(rooms, geo, now) })
  const matchTimer = setInterval(() => matchmaker.tick(), MATCH_TICK_MS)
  const sockets = new WebSocketServer({
    server: http,
    path: '/ws',
    maxPayload: MAX_MESSAGE_BYTES,
    // A page on another site must not be able to open a socket as the player.
    verifyClient: (info: { origin?: string }) => originAllowed(info.origin, config),
  })
  const connectionsByIp = new Map<string, number>()
  const roomStarts = new RateLimiter(MAX_ROOMS_PER_IP_PER_10_MIN, 10 * 60_000, now)
  const failedJoins = new RateLimiter(MAX_FAILED_JOINS_PER_MINUTE, 60_000, now)

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

  sockets.on('connection', (socket: WebSocket, request: IncomingMessage) => {
    const player = playerOf(request, store)
    const ip = clientIp(request.headers, request.socket.remoteAddress, config.trustProxy)
    const open = (connectionsByIp.get(ip) ?? 0) + 1
    if (open > MAX_CONNECTIONS_PER_IP) {
      socket.close(1013, 'Too many connections from this address.')
      return
    }
    connectionsByIp.set(ip, open)
    alive.add(socket)
    socket.on('pong', () => alive.add(socket))
    let room: Room | null = null
    let tokens = BURST
    let refilledAt = Date.now()
    let warnedAt = 0
    let dropped = 0
    let droppedSince = refilledAt
    const send = (message: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
    }

    socket.on('message', (data) => {
      const arrived = Date.now()
      tokens = Math.min(BURST, tokens + ((arrived - refilledAt) / 1000) * MESSAGES_PER_SECOND)
      refilledAt = arrived
      if (tokens < 1) {
        // Over the limit: say so now and then, drop the rest, and cut off a flood.
        if (arrived - droppedSince > DROPPED_WINDOW_MS) [dropped, droppedSince] = [0, arrived]
        if (++dropped > MAX_DROPPED_PER_WINDOW) return socket.close(1008, 'Too many messages.')
        if (arrived - warnedAt > WARN_EVERY_MS) {
          warnedAt = arrived
          send({ t: 'error', message: 'Slow down.' })
        }
        return
      }
      tokens -= 1

      const message = parseClientMessage(data.toString())
      if (!message) return send({ t: 'error', message: 'Unrecognised message.' })

      if (message.t === 'ping') {
        return send({ t: 'pong', sentAt: message.sentAt, serverTime: Date.now() })
      }
      if (message.t === 'queue') {
        if (!player) return send({ t: 'error', message: 'Start a session first.' })
        if (room) return send({ t: 'error', message: 'Leave your room before queueing.' })
        matchmaker.enqueue({
          playerId: player.id,
          accountId: player.accountId,
          ip,
          name: message.name,
          looks: { color: message.color, shape: message.shape, title: message.title },
          send,
          matched: (matchedRoom) => (room = matchedRoom),
        })
        return
      }
      if (message.t === 'queue-leave') {
        if (player) matchmaker.leave(player.id)
        return
      }
      if (message.t === 'queue-bot') {
        if (player) matchmaker.playBot(player.id)
        return
      }
      if (message.t === 'create' || message.t === 'join') {
        if (message.t === 'create') {
          if (rooms.size >= MAX_OPEN_ROOMS) {
            return send({ t: 'error', message: 'The server is full. Try again later.' })
          }
          if (!roomStarts.take(ip)) {
            return send({
              t: 'error',
              message: 'Lots of rooms made recently. Try again in a few minutes.',
            })
          }
        } else if (!failedJoins.allows(ip)) {
          return send({ t: 'error', message: 'Too many wrong codes. Wait a minute and try again.' })
        }
        const target =
          message.t === 'create' ? createRoom(rooms, geo, now) : rooms.get(message.code)
        if (!target) {
          failedJoins.take(ip)
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

    socket.on('close', () => {
      connectionsByIp.set(ip, Math.max(0, (connectionsByIp.get(ip) ?? 1) - 1))
      matchmaker.drop(send)
      room?.disconnect(send)
    })
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
    stats: () => ({ rooms: rooms.size, sockets: sockets.clients.size, queued: matchmaker.waiting }),
    close() {
      clearInterval(sweeper)
      clearInterval(heartbeat)
      clearInterval(matchTimer)
      for (const room of rooms.values()) {
        room.notifyRestart()
        room.dispose()
      }
      for (const client of sockets.clients) client.terminate()
      sockets.close()
    },
  }
}

/** The player a connection belongs to, from the session cookie sent when it opened. */
function playerOf(request: IncomingMessage, store: AuthStore): PlayerRow | null {
  const match = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(
    request.headers.cookie ?? '',
  )
  return match ? store.playerForSession(decodeURIComponent(match[1])) : null
}

function createRoom(rooms: Map<string, Room>, geo: GeoData, now: () => number): Room {
  let code: string
  do {
    code = Array.from(
      { length: ROOM_CODE_LENGTH },
      () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)],
    ).join('')
  } while (rooms.has(code) || RESERVED_CODES.has(code))
  const room = new Room(code, geo, now)
  rooms.set(code, room)
  return room
}
