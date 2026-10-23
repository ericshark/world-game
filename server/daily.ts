import { createHmac } from 'node:crypto'
import type { Hono } from 'hono'
import type { LonLat } from '../src/geo/coords'
import type { GeoData } from '../src/geo/facts'
import type { ModeRules } from '../src/game/core/mode'
import { LOCAL_PLAYER, type DailyPuzzle, type Submission } from '../src/game/core/types'
import { CROWD_MINIMUM, daily, type Crowd, type DailyState } from '../src/game/modes/daily'
import { journey } from '../src/game/modes/journey'
import { mystery } from '../src/game/modes/mystery'
import { dailyNumber } from '../src/game/profile/daily'
import type { AppContext } from './app'
import type { Authentication } from './auth/routes'

/** Bump when a puzzle generator changes, so a published puzzle is never silently rewritten. */
const GENERATOR_VERSION = 1
/** The local date a player sends may differ from the server's by a timezone's worth of days. */
const DATE_TOLERANCE_DAYS = 1
/** A guess sooner than this after the previous move is faster than a person can play. */
export const SUSPICIOUS_MS = 300

const PUZZLES: readonly DailyPuzzle[] = ['five', 'mystery', 'route']
type EventType = 'submit' | 'next' | 'hint' | 'giveUp'

/** What the server needs to know about one kind of daily puzzle. */
interface Puzzle {
  allowed: readonly EventType[]
  start(seed: string, dateKey: string, now: number, geo: GeoData): unknown
  reduce(state: unknown, event: object, geo: GeoData): unknown
  view(state: unknown): unknown
  isFinished(state: unknown): boolean
  score(state: unknown): number
}

function puzzle<Config, State, Event>(
  rules: ModeRules<Config, State, Event>,
  config: (dateKey: string) => Config,
  allowed: readonly EventType[],
): Puzzle {
  return {
    allowed,
    start: (seed, dateKey, now, geo) =>
      rules.start({ config: config(dateKey), seed, now, geo, players: [LOCAL_PLAYER] }),
    reduce: (state, event, geo) => rules.reduce(state as State, event as Event, geo),
    view: (state) => (rules.viewFor ?? ((s: State) => s))(state as State, LOCAL_PLAYER),
    isFinished: (state) => rules.isFinished(state as State),
    score: (state) => rules.summarize(state as State, LOCAL_PLAYER).score,
  }
}

const PUZZLE_RULES: Record<DailyPuzzle, Puzzle> = {
  five: puzzle(daily, (dateKey) => ({ dateKey }), ['submit', 'next']),
  mystery: puzzle(mystery, () => ({ difficulty: 'normal' as const }), ['submit', 'hint', 'giveUp']),
  route: puzzle(journey, () => ({ kind: 'quick' as const, region: 'World' as const }), [
    'submit',
    'hint',
    'giveUp',
  ]),
}

export interface DailyView {
  number: number
  status: 'open' | 'finished'
  /** True when the event changed the game; false for one that was ignored. */
  changed: boolean
  view: unknown
  score: number | null
}

interface Row {
  state: string
  status: 'open' | 'finished'
  score: number | null
  last_event: number
}

export class DailyService {
  private readonly db: AppContext['db']
  private readonly geo: GeoData
  private readonly now: () => number
  private readonly secret: string

  constructor(context: Pick<AppContext, 'db' | 'geo' | 'now'> & { secret: string }) {
    this.db = context.db
    this.geo = context.geo
    this.now = context.now
    this.secret = context.secret
  }

  /** The puzzle's seed: nobody without the server's secret can work out a day's answers. */
  seed(puzzleId: DailyPuzzle, number: number): string {
    return createHmac('sha256', this.secret)
      .update(`${puzzleId}:${number}:v${GENERATOR_VERSION}`)
      .digest('hex')
  }

  /** Whether the date a player says it is could be today where they are. */
  dateAllowed(dateKey: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || Number.isNaN(Date.parse(`${dateKey}T00:00:00Z`))) {
      return false
    }
    const days =
      (Date.parse(`${dateKey}T00:00:00Z`) - Math.floor(this.now() / 86_400_000) * 86_400_000) /
      86_400_000
    return Math.abs(days) <= DATE_TOLERANCE_DAYS
  }

  private load(playerId: string, number: number, puzzleId: DailyPuzzle): Row | null {
    const row = this.db
      .prepare(
        'SELECT state, status, score, last_event FROM daily_sessions WHERE player_id = ? AND number = ? AND puzzle = ?',
      )
      .get(playerId, number, puzzleId)
    return (row as unknown as Row | undefined) ?? null
  }

  /** Begins today's puzzle for a player, or returns where they left off. One attempt only. */
  start(playerId: string, puzzleId: DailyPuzzle, dateKey: string): DailyView {
    const number = dailyNumber(dateKey)
    const existing = this.load(playerId, number, puzzleId)
    if (existing) return this.respond(number, puzzleId, existing, JSON.parse(existing.state), false)

    const now = this.now()
    const state = PUZZLE_RULES[puzzleId].start(this.seed(puzzleId, number), dateKey, now, this.geo)
    this.db
      .prepare(
        `INSERT INTO daily_sessions (player_id, number, puzzle, state, status, last_event, started)
         VALUES (?, ?, ?, ?, 'open', ?, ?)`,
      )
      .run(playerId, number, puzzleId, JSON.stringify(state), now, now)
    return this.respond(number, puzzleId, { status: 'open', score: null }, state, false)
  }

  /** Applies a player's move with the server's clock. Null when there is no such attempt. */
  send(playerId: string, puzzleId: DailyPuzzle, dateKey: string, event: object): DailyView | null {
    const number = dailyNumber(dateKey)
    const row = this.load(playerId, number, puzzleId)
    if (!row) return null
    const state = JSON.parse(row.state)
    if (row.status === 'finished') return this.respond(number, puzzleId, row, state, false)

    const rules = PUZZLE_RULES[puzzleId]
    const now = this.now()
    const next = rules.reduce(state, { ...event, playerId: LOCAL_PLAYER }, this.geo)
    if (next === state) return this.respond(number, puzzleId, row, state, false)

    const finished = rules.isFinished(next)
    const fast =
      (event as { type?: string }).type === 'submit' && now - row.last_event < SUSPICIOUS_MS
    this.db
      .prepare(
        `UPDATE daily_sessions SET state = ?, status = ?, score = ?, last_event = ?,
           flagged = flagged OR ?, finished = ?
         WHERE player_id = ? AND number = ? AND puzzle = ?`,
      )
      .run(
        JSON.stringify(next),
        finished ? 'finished' : 'open',
        finished ? rules.score(next) : null,
        now,
        fast ? 1 : 0,
        finished ? now : null,
        playerId,
        number,
        puzzleId,
      )
    if (puzzleId === 'five')
      this.countCategoryAnswer(number, state as DailyState, next as DailyState)
    return this.respond(
      number,
      puzzleId,
      { status: finished ? 'finished' : 'open', score: finished ? rules.score(next) : null },
      next,
      true,
    )
  }

  /** Remembers which country a player named in the Rare Earth round, once it is revealed. */
  private countCategoryAnswer(number: number, before: DailyState, after: DailyState) {
    for (let i = before.rounds.results.length; i < after.rounds.results.length; i++) {
      const result = after.rounds.results[i][LOCAL_PLAYER]
      if (result?.kind !== 'category' || !result.valid) continue
      this.db
        .prepare(
          `INSERT INTO daily_answers (number, country_id, count) VALUES (?, ?, 1)
           ON CONFLICT (number, country_id) DO UPDATE SET count = count + 1`,
        )
        .run(number, result.answerId)
    }
  }

  private crowd(number: number, state: DailyState): Crowd | null {
    const round = state.rounds.challenges.findIndex((c) => c.kind === 'category')
    if (round < 0 || state.rounds.results.length <= round) return null
    const rows = this.db
      .prepare('SELECT country_id, count FROM daily_answers WHERE number = ?')
      .all(number) as { country_id: string; count: number }[]
    const total = rows.reduce((sum, row) => sum + row.count, 0)
    if (total < CROWD_MINIMUM) return null
    return {
      total,
      percent: Object.fromEntries(
        rows.map((row) => [row.country_id, Math.round((row.count / total) * 100)]),
      ),
    }
  }

  private respond(
    number: number,
    puzzleId: DailyPuzzle,
    row: Pick<Row, 'status' | 'score'>,
    state: unknown,
    changed: boolean,
  ): DailyView {
    let view = PUZZLE_RULES[puzzleId].view(state)
    if (puzzleId === 'five') {
      view = { ...(view as DailyState), crowd: this.crowd(number, state as DailyState) }
    }
    return { number, status: row.status, changed, view, score: row.score }
  }
}

function parsePin(value: unknown): LonLat | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined
  const [lon, lat] = value
  const ok = (n: unknown, limit: number): n is number =>
    typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= limit
  return ok(lon, 180) && ok(lat, 90) ? [lon, lat] : undefined
}

/** A move from a client as the rules should see it, or null if it is malformed or not allowed. */
export function parseEvent(
  raw: unknown,
  allowed: readonly EventType[],
  now: number,
): object | null {
  if (typeof raw !== 'object' || raw === null) return null
  const event = raw as { type?: unknown; submission?: unknown }
  if (typeof event.type !== 'string' || !(allowed as readonly string[]).includes(event.type)) {
    return null
  }
  if (event.type !== 'submit') return { type: event.type, at: now }
  const sent = (event.submission ?? {}) as Record<string, unknown>
  const submission: Submission = { at: now }
  if (sent.pin !== undefined) {
    const pin = parsePin(sent.pin)
    if (!pin) return null
    submission.pin = pin
  }
  if (sent.answerId !== undefined) {
    if (typeof sent.answerId !== 'string' || !/^[A-Z]{3}$/.test(sent.answerId)) return null
    submission.answerId = sent.answerId
  }
  if (sent.hintUsed === true) submission.hintUsed = true
  return { type: 'submit', submission }
}

export function dailyRoutes(api: Hono, context: AppContext, auth: Authentication) {
  const service = new DailyService({ ...context, secret: context.config.dailySecret })

  const route = (puzzleId: string) => PUZZLES.find((p) => p === puzzleId) ?? null

  api.post('/daily/:puzzle/start', async (c) => {
    const current = auth.signedIn(c)
    if (!current) return c.json({ error: 'Start a session first.' }, 401)
    const puzzleId = route(c.req.param('puzzle'))
    const { dateKey } = (await c.req.json().catch(() => ({}))) as { dateKey?: string }
    if (!puzzleId) return c.json({ error: 'No such puzzle.' }, 404)
    if (typeof dateKey !== 'string' || !service.dateAllowed(dateKey)) {
      return c.json({ error: 'That is not today’s date.' }, 400)
    }
    return c.json(service.start(current.player.id, puzzleId, dateKey))
  })

  api.post('/daily/:puzzle/send', async (c) => {
    const current = auth.signedIn(c)
    if (!current) return c.json({ error: 'Start a session first.' }, 401)
    const puzzleId = route(c.req.param('puzzle'))
    const body = (await c.req.json().catch(() => ({}))) as { dateKey?: string; event?: unknown }
    if (!puzzleId) return c.json({ error: 'No such puzzle.' }, 404)
    if (typeof body.dateKey !== 'string' || !service.dateAllowed(body.dateKey)) {
      return c.json({ error: 'That is not today’s date.' }, 400)
    }
    const event = parseEvent(body.event, PUZZLE_RULES[puzzleId].allowed, context.now())
    if (!event) return c.json({ error: 'That move is not allowed.' }, 400)
    const result = service.send(current.player.id, puzzleId, body.dateKey, event)
    if (!result) return c.json({ error: 'Start the puzzle first.' }, 404)
    return c.json(result)
  })

  return service
}
