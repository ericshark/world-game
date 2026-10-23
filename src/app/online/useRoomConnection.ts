import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientMessage, RoomView, ServerMessage } from '../../net/protocol'

/** Where this tab's seat is kept, so a reload or a dropped connection rejoins as the same player. */
const SEAT_KEY = 'world-game:room-seat'
const PING_EVERY_MS = 10_000
const MAX_RETRY_MS = 10_000
/** Clock samples kept; the one with the fastest round trip is the most trustworthy. */
const CLOCK_SAMPLES = 6

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
  /** Set once the host has removed this player: the connection stops trying. */
  kicked: boolean
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
  const [kicked, setKicked] = useState(false)
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
    const samples: { rtt: number; offset: number }[] = []

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
        // A quick burst of pings to sync the clock, then one now and then.
        for (let i = 0; i < 3; i++) window.setTimeout(ping, i * 250)
        pinger = window.setInterval(ping, PING_EVERY_MS)
      }
      socket.onmessage = (event) => {
        let message: ServerMessage
        try {
          message = JSON.parse(String(event.data)) as ServerMessage
        } catch {
          return
        }
        switch (message.t) {
          case 'welcome':
            setPlayerId(message.playerId)
            setError(null)
            saveSeat({ code: message.code, token: message.token })
            break
          case 'room':
            setRoom(message.room)
            break
          case 'pong': {
            // Assume the reply took as long to come back as the request took to arrive; the
            // sample with the quickest round trip has the least room for error.
            const receivedAt = Date.now()
            samples.push({
              rtt: receivedAt - message.sentAt,
              offset: message.serverTime - (message.sentAt + receivedAt) / 2,
            })
            if (samples.length > CLOCK_SAMPLES) samples.shift()
            setClockOffset(samples.reduce((best, s) => (s.rtt < best.rtt ? s : best)).offset)
            break
          }
          case 'error':
            setError(message.message)
            // The room is gone: forget it and the seat in it, rather than show a frozen game.
            if (message.code === 'no-room' || message.code === 'kicked') {
              setRoom(null)
              setPlayerId(null)
              clearSeat()
            }
            if (message.code === 'kicked') {
              setKicked(true)
              closed = true
              socket.close()
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

  return { status, kicked, room, playerId, error, clockOffset, send }
}
