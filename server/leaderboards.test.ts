import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dailyNumber } from '../src/game/profile/daily'
import { DevMailer } from './auth/mail'
import { loadConfig } from './config'
import { loadServerGeo, startServer, type RunningServer } from './index'
import { BOARD_SIZE, MIN_ALLTIME_PLAYS, MIN_DUEL_GAMES } from './leaderboards'
import { testBrowser } from './testBrowser'

const geo = loadServerGeo()
const TODAY = '2026-10-21'
const NUMBER = dailyNumber(TODAY)
let server: RunningServer
let dir: string
let db: DatabaseSync

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wg-boards-'))
  const path = join(dir, 'test.sqlite')
  server = await startServer({
    config: loadConfig({}, { port: 0, host: '127.0.0.1', databasePath: path, distDir: null }),
    geo,
    now: () => Date.parse(`${TODAY}T12:00:00Z`),
    mailer: new DevMailer(() => {}),
  })
  db = new DatabaseSync(path)
})

afterEach(async () => {
  db.close()
  await server.close()
  rmSync(dir, { recursive: true, force: true })
})

function addPlayer(id: string, nickname: string | null = id) {
  db.prepare('INSERT INTO players (id, nickname, created) VALUES (?, ?, 0)').run(id, nickname)
}

function addResult(
  id: string,
  score: number,
  options: { number?: number; puzzle?: string; flagged?: boolean; finished?: boolean } = {},
) {
  const { number = NUMBER, puzzle = 'five', flagged = false, finished = true } = options
  db.prepare(
    `INSERT INTO daily_sessions (player_id, number, puzzle, state, status, score, flagged,
       last_event, started, finished) VALUES (?, ?, ?, '{}', ?, ?, ?, 0, 0, ?)`,
  ).run(
    id,
    number,
    puzzle,
    finished ? 'finished' : 'open',
    finished ? score : null,
    flagged ? 1 : 0,
    score,
  )
}

const get = (path: string, who?: ReturnType<typeof testBrowser>) =>
  (who ?? testBrowser(server)).request(path)

describe('the daily board', () => {
  it('ranks finished, unflagged results by score', async () => {
    for (const [id, score] of [
      ['ana', 4200],
      ['ben', 3100],
      ['cy', 4800],
      ['dee', 100],
    ] as const) {
      addPlayer(id)
      addResult(id, score)
    }
    addPlayer('cheat')
    addResult('cheat', 5000, { flagged: true })
    addPlayer('part')
    addResult('part', 2000, { finished: false })
    addPlayer('other')
    addResult('other', 9999, { puzzle: 'mystery' })

    const { json, status } = await get(`/api/leaderboards/daily?puzzle=five&date=${TODAY}`)
    expect(status).toBe(200)
    expect(
      json.rows.map((r: { name: string; rank: number; value: number }) => [
        r.rank,
        r.name,
        r.value,
      ]),
    ).toEqual([
      [1, 'cy', 4800],
      [2, 'ana', 4200],
      [3, 'ben', 3100],
      [4, 'dee', 100],
    ])
    expect(json.total).toBe(4)
    expect(json.me).toBeNull()
  })

  it('shows a player their own rank and how many they beat', async () => {
    const ana = testBrowser(server)
    const session = await ana.request('/api/session', { body: {} })
    const id = session.json.player.id as string
    addPlayer('a')
    addPlayer('b')
    addPlayer('c')
    addResult('a', 5000)
    addResult(id, 3000)
    addResult('b', 2000)
    addResult('c', 1000)
    const { json } = await get(`/api/leaderboards/daily?puzzle=five&date=${TODAY}`, ana)
    expect(json.me).toEqual({ rank: 2, value: 3000, percentile: 67 })
    expect(json.rows.find((r: { you: boolean }) => r.you)).toMatchObject({ rank: 2 })
  })

  it('shows only the top hundred, but still your own place below them', async () => {
    const ana = testBrowser(server)
    const id = (await ana.request('/api/session', { body: {} })).json.player.id as string
    for (let i = 0; i < 120; i++) {
      addPlayer(`p${i}`)
      addResult(`p${i}`, 5000 - i)
    }
    addResult(id, 10)
    const { json } = await get(`/api/leaderboards/daily?puzzle=five&date=${TODAY}`, ana)
    expect(json.rows).toHaveLength(BOARD_SIZE)
    expect(json.total).toBe(121)
    expect(json.me.rank).toBe(121)
  })

  it('calls players without a nickname guests, and checks the request', async () => {
    addPlayer('x', null)
    addResult('x', 100)
    const { json } = await get(`/api/leaderboards/daily?puzzle=five&date=${TODAY}`)
    expect(json.rows[0].name).toBe('Guest')
    expect((await get('/api/leaderboards/daily?puzzle=nope&date=' + TODAY)).status).toBe(404)
    expect((await get('/api/leaderboards/daily?puzzle=five&date=2026-01-01')).status).toBe(400)
  })
})

describe('the duel ladder', () => {
  function rate(id: string, rating: number, games: number, exists = false) {
    if (!exists) addPlayer(id)
    db.prepare(
      'INSERT INTO ratings (player_id, rating, rd, vol, games, updated) VALUES (?, ?, 80, 0.06, ?, 0)',
    ).run(id, rating, games)
  }

  it('lists players with enough games by rating, and says how far you are otherwise', async () => {
    rate('top', 1700, MIN_DUEL_GAMES)
    rate('mid', 1600, 30)
    rate('new', 1900, MIN_DUEL_GAMES - 1)
    const ana = testBrowser(server)
    const id = (await ana.request('/api/session', { body: {} })).json.player.id as string
    rate(id, 1550, 2, true)
    const { json } = await get('/api/leaderboards/duel', ana)
    expect(json.rows.map((r: { name: string }) => r.name)).toEqual(['top', 'mid'])
    expect(json.me).toBeNull()
    expect(json.progress).toEqual({ have: 2, need: MIN_DUEL_GAMES })
  })
})

describe('the all-time board', () => {
  it('averages Daily Five scores over enough plays', async () => {
    addPlayer('steady')
    addPlayer('few')
    addPlayer('lucky')
    for (let day = 0; day < MIN_ALLTIME_PLAYS; day++) {
      addResult('steady', day % 2 === 0 ? 4000 : 3000, { number: day })
      addResult('lucky', 3500, { number: day, flagged: day === 0 })
    }
    for (let day = 0; day < MIN_ALLTIME_PLAYS - 1; day++) addResult('few', 5000, { number: day })
    const { json } = await get('/api/leaderboards/alltime')
    // 'lucky' has one flagged result, leaving too few; 'few' never reached seven.
    expect(json.rows).toEqual([
      { rank: 1, name: 'steady', value: 3571, count: MIN_ALLTIME_PLAYS, you: false },
    ])
  })
})
