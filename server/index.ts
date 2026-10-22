// The World Battle server: private rooms for real-time games on your machine or local network.
// Run with `npm run server`; the Vite dev server forwards /ws here.
import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { CountryIndex, type CountryCollection } from '../src/geo/countries'
import { GeoData, type FactsFile } from '../src/geo/facts'
import { parseClientMessage, ROOM_CODE_LENGTH, type ServerMessage } from '../src/net/protocol'
import { Room } from './room'

export const DEFAULT_PORT = 8788
const MAX_MESSAGE_BYTES = 4096
/** Each connection may send this many messages a second, with short bursts allowed. */
const MESSAGES_PER_SECOND = 10
const BURST = 20
const IDLE_ROOM_MS = 30 * 60_000
// No I or O: codes are read aloud and typed on phones.
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

export function loadServerGeo(): GeoData {
  const read = <T>(file: string) =>
    JSON.parse(readFileSync(new URL(`../public/data/${file}`, import.meta.url), 'utf8')) as T
  return new GeoData(
    new CountryIndex(read<CountryCollection>('countries.json')),
    read<FactsFile>('facts.json'),
  )
}

export interface RunningServer {
  port: number
  close(): Promise<void>
}

export async function startServer({
  port = DEFAULT_PORT,
  host = '0.0.0.0',
  geo = loadServerGeo(),
}: { port?: number; host?: string; geo?: GeoData } = {}): Promise<RunningServer> {
  const rooms = new Map<string, Room>()
  const http = createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'text/plain' }).end(`ok ${rooms.size} rooms`)
    } else {
      response.writeHead(404).end()
    }
  })
  const sockets = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_MESSAGE_BYTES })

  sockets.on('connection', (socket: WebSocket) => {
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
        room?.disconnect(send)
        const target = message.t === 'create' ? createRoom(rooms, geo) : rooms.get(message.code)
        if (!target) return send({ t: 'error', message: 'No room with that code.' })
        const token = message.t === 'join' ? message.token : undefined
        const problem = target.join(message.name, message.color, token, send)
        if (problem) return send({ t: 'error', message: problem })
        room = target
        return
      }
      room?.handle(send, message)
    })

    socket.on('close', () => room?.disconnect(send))
    // Dropped connections (closed tabs, sleeping phones) reset sockets; 'close' handles them.
    socket.on('error', () => {})
  })

  // Rooms nobody has used for a while are closed.
  const sweeper = setInterval(() => {
    for (const [code, room] of rooms) {
      if (room.connectedCount === 0 && Date.now() - room.lastActivity > IDLE_ROOM_MS) {
        room.dispose()
        rooms.delete(code)
      }
    }
  }, 60_000)

  const actualPort = await listen(http, port, host)
  return {
    port: actualPort,
    close: () =>
      new Promise((resolve) => {
        clearInterval(sweeper)
        for (const room of rooms.values()) room.dispose()
        for (const client of sockets.clients) client.terminate()
        sockets.close()
        http.close(() => resolve())
      }),
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

function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      const address = server.address()
      resolve(typeof address === 'object' && address ? address.port : port)
    })
  })
}

/** Tries the port, then the next ones, until one is free. */
async function startOnFreePort(first: number): Promise<RunningServer> {
  for (let port = first; port < first + 20; port++) {
    try {
      return await startServer({ port })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
    }
  }
  throw new Error(`No free port from ${first}`)
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const requested = Number(process.env.PORT ?? DEFAULT_PORT)
  const server = await startOnFreePort(requested)
  console.log(`World Battle server on port ${server.port} (ws path /ws)`)
  const stop = async () => {
    await server.close()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
