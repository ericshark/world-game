// Simulates a crowd against a running server, to see what it costs and where it strains.
//
//   TRUST_PROXY=1 METRICS_TOKEN=tok DAILY_SECRET=x npm start        (in one terminal)
//   npx tsx scripts/loadtest.ts --url http://localhost:8789 --players 300 --seconds 60 \
//     --pid <server pid> --token tok
//
// A third of the players sit in four-person party rooms, a third play the ranked Daily Five
// over HTTP (as a new guest each time they finish), and a third queue for Quick Duels. Each
// simulated player has an address of their own (sent as X-Forwarded-For), so the server must
// be started with TRUST_PROXY=1 or its per-address limits will stop the test early.
import { readFileSync } from 'node:fs'
import { WebSocket } from 'ws'

const args = new Map<string, string>()
for (let i = 2; i < process.argv.length; i += 2)
  args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1])
const URL_BASE = (args.get('url') ?? 'http://localhost:8789').replace(/\/$/, '')
const PLAYERS = Number(args.get('players') ?? 300)
const SECONDS = Number(args.get('seconds') ?? 60)
const PID = args.get('pid') ? Number(args.get('pid')) : null
const TOKEN = args.get('token') ?? null
const WS_BASE = URL_BASE.replace(/^http/, 'ws')

const latencies: Record<string, number[]> = { move: [], http: [] }
let errors = 0
let started = 0
let finishedGames = 0
const stopAt = Date.now() + SECONDS * 1000
const running = () => Date.now() < stopAt
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const jitter = (min: number, max: number) => min + Math.random() * (max - min)
const addressOf = (n: number) => `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`
const randomPin = (): [number, number] => [jitter(-170, 170), jitter(-60, 70)]

function record(kind: 'move' | 'http', ms: number) {
  latencies[kind].push(ms)
}

/** A guest with a cookie and an address of their own. */
class Guest {
  cookie = ''
  constructor(readonly address: string) {}

  async http(path: string, body?: object, method = body ? 'POST' : 'GET') {
    const began = performance.now()
    const response = await fetch(`${URL_BASE}${path}`, {
      method,
      headers: {
        'x-forwarded-for': this.address,
        ...(body ? { 'content-type': 'application/json' } : {}),
        cookie: this.cookie,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    record('http', performance.now() - began)
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(';')
      this.cookie = pair
    }
    if (!response.ok) errors++
    return (await response.json().catch(() => null)) as any
  }

  socket() {
    const socket = new WebSocket(`${WS_BASE}/ws`, {
      headers: { 'x-forwarded-for': this.address, cookie: this.cookie },
    })
    socket.on('error', () => errors++)
    return socket
  }
}

const looks = { color: '#ff6b6b' }
const send = (socket: WebSocket, message: object) => socket.send(JSON.stringify(message))

/** Plays a battle over a socket: answers every round after a short think, then moves on. */
function playBattle(socket: WebSocket, playerId: () => string | null) {
  let answeredRound = -1
  let lastSent = 0
  let readyRound = -1
  socket.on('message', (data) => {
    const message = JSON.parse(data.toString())
    if (message.t !== 'room' || !message.room.battle) return
    if (lastSent) record('move', performance.now() - lastSent)
    lastSent = 0
    const { rounds } = message.room.battle
    if (message.room.phase === 'finished') {
      finishedGames++
      return
    }
    const challenge = rounds.challenges[rounds.round]
    if (rounds.phase === 'open' && answeredRound !== rounds.round && challenge) {
      answeredRound = rounds.round
      const round = rounds.round
      setTimeout(
        () => {
          if (socket.readyState !== WebSocket.OPEN) return
          lastSent = performance.now()
          send(socket, {
            t: 'submit',
            round,
            pin: randomPin(),
            ...(challenge.kind === 'identify' || challenge.kind === 'category'
              ? { answerId: 'FRA' }
              : {}),
          })
        },
        jitter(500, 4000),
      )
    } else if (rounds.phase === 'revealed' && readyRound !== rounds.round) {
      readyRound = rounds.round
      setTimeout(
        () => socket.readyState === WebSocket.OPEN && send(socket, { t: 'ready' }),
        jitter(500, 2500),
      )
    }
  })
  void playerId
}

async function partyRoom(index: number) {
  const guests = Array.from({ length: 4 }, (_, i) => new Guest(addressOf(1000 + index * 4 + i)))
  while (running()) {
    for (const guest of guests) await guest.http('/api/session', {})
    const host = guests[0].socket()
    await new Promise((resolve) => host.once('open', resolve))
    const code = await new Promise<string>((resolve) => {
      host.on('message', (data) => {
        const message = JSON.parse(data.toString())
        if (message.t === 'welcome') resolve(message.code)
      })
      send(host, { t: 'create', name: 'Host', ...looks })
    })
    const others = guests.slice(1).map((guest) => guest.socket())
    await Promise.all(others.map((s) => new Promise((resolve) => s.once('open', resolve))))
    others.forEach((s, i) => send(s, { t: 'join', code, name: `P${i}`, ...looks }))
    await sleep(500)
    others.forEach((s) => send(s, { t: 'set-ready', ready: true }))
    send(host, {
      t: 'configure',
      settings: {
        format: 'party',
        content: 'mixed',
        bots: 0,
        botSkill: 'novice',
        region: 'World',
        roundMs: 15000,
      },
    })
    await sleep(300)
    for (const s of [host, ...others]) playBattle(s, () => null)
    send(host, { t: 'start' })
    started += 4
    // A party game is ten or so rounds; play one through, or until the test ends.
    await sleep(Math.min(stopAt - Date.now(), 120_000))
    for (const s of [host, ...others]) s.close()
    await sleep(200)
  }
}

async function soloDaily(index: number) {
  while (running()) {
    const guest = new Guest(addressOf(100_000 + index * 1000 + Math.floor(Math.random() * 999)))
    await guest.http('/api/session', {})
    const now = new Date()
    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    let view = (await guest.http('/api/daily/five/start', { dateKey }))?.view
    started++
    for (let round = 0; round < 5 && view && running(); round++) {
      await sleep(jitter(400, 2000))
      const challenge = view.rounds.challenges[round]
      const submission =
        challenge.kind === 'identify'
          ? { answerId: 'FRA' }
          : challenge.kind === 'category'
            ? { answerId: 'FRA', pin: randomPin() }
            : { pin: randomPin() }
      await guest.http('/api/daily/five/send', { dateKey, event: { type: 'submit', submission } })
      await sleep(jitter(300, 1200))
      view = (await guest.http('/api/daily/five/send', { dateKey, event: { type: 'next' } }))?.view
    }
    finishedGames++
    await guest.http('/api/leaderboards/daily?puzzle=five&date=' + dateKey)
    await sleep(jitter(500, 3000))
  }
}

async function queueDuelist(index: number) {
  while (running()) {
    const guest = new Guest(addressOf(200_000 + index * 1000 + Math.floor(Math.random() * 999)))
    await guest.http('/api/session', {})
    const socket = guest.socket()
    await new Promise((resolve) => socket.once('open', resolve))
    playBattle(socket, () => null)
    send(socket, { t: 'queue', name: `D${index}`, ...looks })
    started++
    await sleep(Math.min(stopAt - Date.now(), 90_000))
    socket.close()
    await sleep(200)
  }
}

/** Server CPU and memory from /proc, sampled while the crowd plays. */
function watchServer() {
  const samples: { cpu: number; rss: number }[] = []
  if (PID === null) return { samples, stop: () => {} }
  const ticksPerSecond = 100
  const read = () => {
    const stat = readFileSync(`/proc/${PID}/stat`, 'utf8').split(' ')
    const ticks = Number(stat[13]) + Number(stat[14])
    const rss = Number(readFileSync(`/proc/${PID}/statm`, 'utf8').split(' ')[1]) * 4096
    return { ticks, rss }
  }
  let previous = read()
  const timer = setInterval(() => {
    const now = read()
    samples.push({ cpu: ((now.ticks - previous.ticks) / ticksPerSecond) * 100, rss: now.rss })
    previous = now
  }, 1000)
  return { samples, stop: () => clearInterval(timer) }
}

const percentile = (values: number[], p: number) => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

const watch = watchServer()
console.log(`${PLAYERS} players for ${SECONDS} s against ${URL_BASE}`)
const rooms = Math.floor(PLAYERS / 3 / 4)
const daily = Math.floor(PLAYERS / 3)
const duelists = PLAYERS - rooms * 4 - daily
await Promise.all([
  ...Array.from({ length: rooms }, (_, i) => partyRoom(i)),
  ...Array.from({ length: daily }, (_, i) => soloDaily(i)),
  ...Array.from({ length: duelists }, (_, i) => queueDuelist(i)),
])
watch.stop()

let counters: unknown = null
if (TOKEN) {
  counters = await fetch(`${URL_BASE}/admin/counters`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  })
    .then((r) => r.json())
    .catch(() => null)
}
const cpu = watch.samples.map((s) => s.cpu)
console.log(
  JSON.stringify(
    {
      players: PLAYERS,
      mix: { partyPlayers: rooms * 4, dailyPlayers: daily, queuedPlayers: duelists },
      startedSessions: started,
      finishedGames,
      errors,
      moveLatencyMs: {
        p50: Math.round(percentile(latencies.move, 50)),
        p95: Math.round(percentile(latencies.move, 95)),
        p99: Math.round(percentile(latencies.move, 99)),
        n: latencies.move.length,
      },
      httpLatencyMs: {
        p50: Math.round(percentile(latencies.http, 50)),
        p95: Math.round(percentile(latencies.http, 95)),
        p99: Math.round(percentile(latencies.http, 99)),
        n: latencies.http.length,
      },
      serverCpuPercentOfOneCore: cpu.length
        ? {
            mean: Math.round(cpu.reduce((a, b) => a + b, 0) / cpu.length),
            max: Math.round(Math.max(...cpu)),
          }
        : 'not measured (pass --pid)',
      serverMemoryMB: watch.samples.length
        ? Math.round(Math.max(...watch.samples.map((s) => s.rss)) / 1e6)
        : 'not measured',
      serverCounters: counters,
    },
    null,
    2,
  ),
)
process.exit(0)
