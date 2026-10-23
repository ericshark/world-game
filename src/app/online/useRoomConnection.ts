import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientMessage, RoomView, ServerMessage } from '../../net/protocol'

/** Where this tab's seat is kept, so a reload or a dropped connection rejoins as the same player. */
const SEAT_KEY = 'world-game:room-seat'
const PING_EVERY_MS = 10_000
const MAX_RETRY_MS = 10_000

export interface Seat {
  code: string
  token: string
}

export function loadSeat(): Seat | null {
  try {
    const raw = sessionStorage.getItem(SEAT_KEY)
    return raw ? (JSON.parse(raw) as Seat) : null
  } catch {
    return null
  }
}

function clearSeat() {
  try {
    sessionStorage.removeItem(SEAT_KEY)
  } catch {
    // Nothing saved, nothing to clear.
  }
}

function saveSeat(seat: Seat) {
  try {
    sessionStorage.setItem(SEAT_KEY, JSON.stringify(seat))
  } catch {
    // Without storage, a reload simply joins as a new player.
  }
}

export interface RoomConnection {
  status: 'connecting' | 'open' | 'closed'
  room: RoomView | null
  playerId: string | null
  error: string | null
  /** Server clock minus this clock, measured with pings. */
  clockOffset: number
  send(message: ClientMessage): void
}

/**
 * A connection to the battle server through the dev server's /ws proxy. It reconnects with a
 * growing delay and, once it knows its seat, rejoins automatically.
 */
export function useRoomConnection(
  onOpen: (send: (m: ClientMessage) => void) => void,
): RoomConnection {
  const [status, setStatus] = useState<RoomConnection['status']>('connecting')
  const [room, setRoom] = useState<RoomView | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clockOffset, setClockOffset] = useState(0)
  const socketRef = useRef<WebSocket | null>(null)
  const onOpenRef = useRef(onOpen)
  useEffect(() => {
    onOpenRef.current = onOpen
  })

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }, [])

  useEffect(() => {
    let closed = false
    let retry = 1000
    let pinger = 0
    let reconnect = 0

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const socket = new WebSocket(`${protocol}://${window.location.host}/ws`)
      socketRef.current = socket
      setStatus('connecting')

      socket.onopen = () => {
        retry = 1000
        setStatus('open')
        onOpenRef.current(send)
        const ping = () => send({ t: 'ping', sentAt: Date.now() })
        ping()
        pinger = window.setInterval(ping, PING_EVERY_MS)
      }
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as ServerMessage
        switch (message.t) {
          case 'welcome':
            setPlayerId(message.playerId)
            setError(null)
            saveSeat({ code: message.code, token: message.token })
            break
          case 'room':
            setRoom(message.room)
            break
          case 'pong':
            // Assume the reply took as long to come back as the request took to arrive.
            setClockOffset(message.serverTime - (message.sentAt + Date.now()) / 2)
            break
          case 'error':
            setError(message.message)
            // The room is gone: forget it and the seat in it, rather than show a frozen game.
            if (message.code === 'no-room') {
              setRoom(null)
              setPlayerId(null)
              clearSeat()
            }
            break
        }
      }
      socket.onclose = () => {
        window.clearInterval(pinger)
        if (closed) return
        setStatus('closed')
        reconnect = window.setTimeout(connect, retry)
        retry = Math.min(MAX_RETRY_MS, retry * 2)
      }
    }

    connect()
    return () => {
      closed = true
      window.clearInterval(pinger)
      window.clearTimeout(reconnect)
      socketRef.current?.close()
    }
  }, [send])

  return { status, room, playerId, error, clockOffset, send }
}
