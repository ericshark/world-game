import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildCategories } from '../src/game/core/categories'
import type { Challenge } from '../src/game/core/types'
import type { DailyState } from '../src/game/modes/daily'
import { dailyNumber } from '../src/game/profile/daily'
import { DevMailer } from './auth/mail'
import { loadConfig } from './config'
import { loadServerGeo, startServer, type RunningServer } from './index'
import { testBrowser, type TestBrowser } from './testBrowser'

const geo = loadServerGeo()
const TODAY = '2026-10-21'
let server: RunningServer
let dir: string
let clock: number

async function boot(secret: string) {
  server = await startServer({
    config: loadConfig(
      {},
      {
        port: 0,
        host: '127.0.0.1',
        databasePath: join(dir, 'test.sqlite'),
        distDir: null,
        dailySecret: secret,
      },
    ),
    geo,
    now: () => clock,
    mailer: new DevMailer(() => {}),
  })
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'wg-daily-'))
  clock = Date.parse(`${TODAY}T12:00:00Z`)
  await boot('secret-one')
})

afterEach(async () => {
  await server.close()
  rmSync(dir, { recursive: true, force: true })
})

async function player(): Promise<TestBrowser> {
  const person = testBrowser(server)
  await person.request('/api/session', { body: {} })
  return person
}

const start = (person: TestBrowser, puzzle: string, dateKey = TODAY) =>
  person.request(`/api/daily/${puzzle}/start`, { body: { dateKey } })

const send = (person: TestBrowser, puzzle: string, event: object, dateKey = TODAY) =>
  person.request(`/api/daily/${puzzle}/send`, { body: { dateKey, event } })

/** A believable pause between moves, so nobody looks like a robot. */
const think = () => (clock += 2000)

const labelOf = (countryId: string) => geo.factsOf(countryId).label

describe('starting a daily', () => {
  it('needs a session, a real puzzle and a plausible date', async () => {
    const stranger = testBrowser(server)
    expect((await start(stranger, 'five')).status).toBe(401)
    const ana = await player()
    expect((await start(ana, 'nonsense')).status).toBe(404)
    expect((await start(ana, 'five', 'yesterday')).status).toBe(400)
    expect((await start(ana, 'five', '2026-13-45')).status).toBe(400)
    // A timezone's worth of difference is fine; two days is not today anywhere.
    expect((await start(ana, 'five', '2026-10-20')).status).toBe(200)
    expect((await start(ana, 'five', '2026-10-22')).status).toBe(200)
    expect((await start(ana, 'five', '2026-10-19')).status).toBe(400)
    expect((await start(ana, 'five', '2026-10-23')).status).toBe(400)
  })

  it('gives the same puzzle to everyone, and hides the seed and the later rounds', async () => {
    const ana = await player()
    const ben = await player()
    const first = await start(ana, 'five')
    const second = await start(ben, 'five')
    expect(first.json.number).toBe(dailyNumber(TODAY))
    expect(first.json.view.rounds.challenges).toEqual(second.json.view.rounds.challenges)
    expect(first.json.view.seed).toBe('')
    const shown = first.json.view.rounds.challenges.map((c: Challenge) =>
      c.kind === 'category' ? c.category.id : c.countryId,
    )
    expect(shown[0]).not.toBe('')
    expect(shown.slice(1).every((id: string) => id === '')).toBe(true)
    expect(JSON.stringify(first.json)).not.toMatch(/"seed":"[^"]/)
  })

  it('depends on the server’s secret', async () => {
    const ana = await player()
    const before = (await start(ana, 'mystery')).json
    const route = (await start(ana, 'route')).json.view
    expect(route.from).not.toBe('')
    await server.close()
    rmSync(join(dir, 'test.sqlite'))
    await boot('secret-two')
    const again = await player()
    const after = (await start(again, 'route')).json.view
    // Different secret, different journey (a clash is possible but absurdly unlikely).
    expect([after.from, after.to]).not.toEqual([route.from, route.to])
    expect(before.view.targetId).toBe('')
  })

  it('resumes the same attempt rather than starting another', async () => {
    const ana = await player()
    const first = (await start(ana, 'five')).json.view as DailyState
    const challenge = first.rounds.challenges[0]
    if (challenge.kind !== 'locate') throw new Error('expected a locate round')
    think()
    await send(ana, 'five', {
      type: 'submit',
      submission: { pin: labelOf(challenge.countryId), at: 0 },
    })
    const resumed = (await start(ana, 'five')).json.view as DailyState
    expect(resumed.rounds.phase).toBe('revealed')
    expect(resumed.rounds.results).toHaveLength(1)
  })
})

describe('playing the Daily Five', () => {
  async function playThrough(person: TestBrowser) {
    let view = (await start(person, 'five')).json.view as DailyState
    for (let round = 0; round < 5; round++) {
      const challenge = view.rounds.challenges[round]
      think()
      const submission =
        challenge.kind === 'identify'
          ? { answerId: challenge.countryId }
          : challenge.kind === 'category'
            ? { answerId: 'FRA', pin: labelOf('FRA') }
            : { pin: labelOf(challenge.countryId) }
      const played = await send(person, 'five', { type: 'submit', submission })
      expect(played.status).toBe(200)
      think()
      view = (await send(person, 'five', { type: 'next' })).json.view
    }
    return view
  }

  it('is scored by the server, one attempt only', async () => {
    const ana = await player()
    const view = await playThrough(ana)
    expect(view.rounds.phase).toBe('finished')
    expect(view.seed).toBe('')

    const again = await start(ana, 'five')
    expect(again.json.status).toBe('finished')
    expect(again.json.score).toBeGreaterThan(0)
    // Nothing more can be played, and nothing changes.
    const extra = await send(ana, 'five', { type: 'next' })
    expect(extra.json.changed).toBe(false)
    expect(extra.json.score).toBe(again.json.score)

    const db = new DatabaseSync(join(dir, 'test.sqlite'), { readOnly: true })
    const rows = db.prepare('SELECT status, flagged FROM daily_sessions').all()
    db.close()
    expect(rows).toEqual([{ status: 'finished', flagged: 0 }])
  })

  it('refuses moves it does not understand', async () => {
    const ana = await player()
    await start(ana, 'five')
    expect((await send(ana, 'five', { type: 'giveUp' })).status).toBe(400)
    expect((await send(ana, 'five', { type: 'tick' })).status).toBe(400)
    expect((await send(ana, 'five', 'nope' as unknown as object)).status).toBe(400)
    const badPin = { type: 'submit', submission: { pin: [999, 0] } }
    expect((await send(ana, 'five', badPin)).status).toBe(400)
    const badId = { type: 'submit', submission: { answerId: 'france' } }
    expect((await send(ana, 'five', badId)).status).toBe(400)
    // A move for a puzzle that was never started.
    const ben = await player()
    expect((await send(ben, 'five', { type: 'next' })).status).toBe(404)
  })

  it('survives an answer that names no country', async () => {
    const ana = await player()
    const view = (await start(ana, 'five')).json.view as DailyState
    think()
    // Answer the first round (a locate round) with a country-shaped code that does not exist.
    const result = await send(ana, 'five', { type: 'submit', submission: { answerId: 'ZZZ' } })
    expect(result.status).toBe(200)
    expect(view.rounds.round).toBe(0)
    // The server is still up.
    expect((await start(ana, 'mystery')).status).toBe(200)
  })

  it('flags moves faster than a person can make them', async () => {
    const robot = await player()
    const human = await player()
    const first = (await start(robot, 'five')).json.view as DailyState
    const target = first.rounds.challenges[0]
    if (target.kind !== 'locate') throw new Error('expected a locate round')
    const move = { type: 'submit', submission: { pin: labelOf(target.countryId) } }
    clock += 100
    await send(robot, 'five', move)
    await start(human, 'five')
    clock += 5000
    await send(human, 'five', move)

    const db = new DatabaseSync(join(dir, 'test.sqlite'), { readOnly: true })
    const flags = db.prepare('SELECT flagged FROM daily_sessions ORDER BY flagged').all()
    db.close()
    expect(flags).toEqual([{ flagged: 0 }, { flagged: 1 }])
  })
})

describe('the Mystery Country', () => {
  it('never shows the country before the end, but explains hints and guesses', async () => {
    const ana = await player()
    const opening = (await start(ana, 'mystery')).json.view
    expect(opening.targetId).toBe('')
    expect(opening.seed).toBe('')

    const guesses = geo.playableIds.slice(0, 7)
    let view = opening
    for (const answerId of guesses) {
      think()
      const reply = await send(ana, 'mystery', { type: 'submit', submission: { answerId } })
      if (reply.json.view.endedAt !== null) {
        // Lucky enough to find it: the country is shown now.
        expect(reply.json.view.targetId).toBe(answerId)
        return
      }
      view = reply.json.view
      expect(view.targetId).toBe('')
    }
    expect(view.guesses).toHaveLength(7)
    think()
    const hinted = (await send(ana, 'mystery', { type: 'hint' })).json.view
    expect(hinted.hintUsed).toBe(true)
    expect(hinted.hintRegion).toMatch(/\w/)
    expect(hinted.targetId).toBe('')
    think()
    const over = await send(ana, 'mystery', { type: 'giveUp' })
    expect(over.json.status).toBe('finished')
    expect(over.json.view.targetId).toMatch(/^[A-Z]{3}$/)
  })
})

describe('the Daily Route', () => {
  it('can be given up, and counts as the one attempt', async () => {
    const ana = await player()
    const opening = (await start(ana, 'route')).json
    expect(opening.view.par).toBeGreaterThan(0)
    expect(opening.view.seed).toBe('')
    think()
    const over = await send(ana, 'route', { type: 'giveUp' })
    expect(over.json.status).toBe('finished')
    expect((await start(ana, 'route')).json.status).toBe('finished')
  })
})

describe('how other players answered Rare Earth', () => {
  function seedAnswers(number: number, answers: Record<string, number>) {
    const db = new DatabaseSync(join(dir, 'test.sqlite'))
    for (const [countryId, count] of Object.entries(answers)) {
      db.prepare('INSERT INTO daily_answers (number, country_id, count) VALUES (?, ?, ?)').run(
        number,
        countryId,
        count,
      )
    }
    db.close()
  }

  async function reachCategoryReveal(person: TestBrowser) {
    let view = (await start(person, 'five')).json.view as DailyState
    for (let round = 0; round < 3; round++) {
      const challenge = view.rounds.challenges[round]
      think()
      const submission =
        challenge.kind === 'identify'
          ? { answerId: challenge.countryId }
          : challenge.kind === 'category'
            ? { answerId: 'FRA', pin: labelOf('FRA') }
            : { pin: labelOf(challenge.countryId) }
      const reply = await send(person, 'five', { type: 'submit', submission })
      view = reply.json.view
      if (round < 2) {
        think()
        view = (await send(person, 'five', { type: 'next' })).json.view
      }
    }
    return view
  }

  it('stay private until thirty players have answered', async () => {
    seedAnswers(dailyNumber(TODAY), { JPN: 10, BRA: 10 })
    const view = await reachCategoryReveal(await player())
    expect(view.crowd).toBeNull()
  })

  it('then show what share of players named each country', async () => {
    seedAnswers(dailyNumber(TODAY), { JPN: 30, BRA: 10, CAN: 10 })
    const view = await reachCategoryReveal(await player())
    expect(view.crowd).toMatchObject({ total: 50, percent: { JPN: 60, BRA: 20, CAN: 20 } })
  })

  it('count each valid answer once the round is revealed', async () => {
    const ana = await player()
    const category = buildCategories(geo)
    let view = (await start(ana, 'five')).json.view as DailyState
    for (let round = 0; round < 3; round++) {
      const challenge = view.rounds.challenges[round]
      think()
      let submission: object
      if (challenge.kind === 'category') {
        const full = category.find((c) => c.id === challenge.category.id)!
        submission = { answerId: full.valid[0], pin: labelOf(full.valid[0]) }
      } else {
        submission =
          challenge.kind === 'identify'
            ? { answerId: challenge.countryId }
            : { pin: labelOf(challenge.countryId) }
      }
      view = (await send(ana, 'five', { type: 'submit', submission })).json.view
      if (round < 2) {
        const db = new DatabaseSync(join(dir, 'test.sqlite'), { readOnly: true })
        expect(db.prepare('SELECT COUNT(*) AS n FROM daily_answers').get()).toEqual({ n: 0 })
        db.close()
        think()
        view = (await send(ana, 'five', { type: 'next' })).json.view
      }
    }
    const db = new DatabaseSync(join(dir, 'test.sqlite'), { readOnly: true })
    const rows = db.prepare('SELECT count FROM daily_answers').all()
    db.close()
    expect(rows).toEqual([{ count: 1 }])
  })
})
