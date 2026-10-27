import type { Hono } from 'hono'
import type { DailyPuzzle } from '../src/game/core/types'
import { dailyNumber } from '../src/game/profile/daily'
import type { AppContext } from './app'
import { getConnInfo } from '@hono/node-server/conninfo'
import { RateLimiter } from './auth/rateLimit'
import type { Authentication } from './auth/routes'
import { clientIp } from './security'
import { dateAllowed } from './daily'

export const BOARD_SIZE = 100
/** A duel rating needs this many rated games before it is ranked. */
export const MIN_DUEL_GAMES = 5
/** An all-time average needs this many Daily Fives. */
export const MIN_ALLTIME_PLAYS = 7

export interface BoardRow {
  rank: number
  name: string
  /** A score, an average or a rating, depending on the board. */
  value: number
  /** Plays or games behind the value. */
  count?: number
  you: boolean
}

export interface Board {
  rows: BoardRow[]
  /** The caller's own place, even when outside the shown rows. */
  me: { rank: number; value: number; count?: number; percentile?: number } | null
  /** Players counted on this board. */
  total: number
  /** For a ladder that someone may not have qualified for yet: games played so far. */
  progress?: { have: number; need: number }
}

interface Ranked {
  player_id: string
  nickname: string | null
  value: number
  count?: number
}

const PUZZLES: readonly DailyPuzzle[] = ['five', 'mystery', 'route']

function shape(all: Ranked[], playerId: string | null, rounding = 0): Board {
  const rank = (index: number) => index + 1
  const factor = 10 ** rounding
  const round = (n: number) => Math.round(n * factor) / factor
  const rows = all.slice(0, BOARD_SIZE).map((row, index) => ({
    rank: rank(index),
    name: row.nickname ?? 'Guest',
    value: round(row.value),
    count: row.count,
    you: row.player_id === playerId,
  }))
  const mine = playerId ? all.findIndex((row) => row.player_id === playerId) : -1
  const me =
    mine < 0
      ? null
      : {
          rank: rank(mine),
          value: round(all[mine].value),
          count: all[mine].count,
          // The share of other players this one finished ahead of.
          percentile:
            all.length > 1
              ? Math.round(
                  (all.filter((row) => row.value < all[mine].value).length / (all.length - 1)) *
                    100,
                )
              : undefined,
        }
  return { rows, me, total: all.length }
}

/** Flagged results (moves faster than a person can make them) never reach a board. */
export class Leaderboards {
  private readonly db: AppContext['db']

  constructor(db: AppContext['db']) {
    this.db = db
  }

  daily(puzzle: DailyPuzzle, number: number, playerId: string | null): Board {
    const rows = this.db
      .prepare(
        `SELECT s.player_id, p.nickname, s.score AS value FROM daily_sessions s
           JOIN players p ON p.id = s.player_id
          WHERE s.number = ? AND s.puzzle = ? AND s.status = 'finished' AND s.flagged = 0
          ORDER BY s.score DESC, s.finished ASC`,
      )
      .all(number, puzzle) as unknown as Ranked[]
    return shape(rows, playerId)
  }

  duel(playerId: string | null): Board {
    const rows = this.db
      .prepare(
        `SELECT r.player_id, p.nickname, r.rating AS value, r.games AS count FROM ratings r
           JOIN players p ON p.id = r.player_id
          WHERE r.games >= ?
          ORDER BY r.rating DESC, r.games DESC`,
      )
      .all(MIN_DUEL_GAMES) as unknown as Ranked[]
    const board = shape(rows, playerId)
    if (playerId && !board.me) {
      const own = this.db.prepare('SELECT games FROM ratings WHERE player_id = ?').get(playerId) as
        { games: number } | undefined
      board.progress = { have: own?.games ?? 0, need: MIN_DUEL_GAMES }
    }
    return board
  }

  allTime(playerId: string | null): Board {
    const rows = this.db
      .prepare(
        `SELECT s.player_id, p.nickname, AVG(s.score) AS value, COUNT(*) AS count
           FROM daily_sessions s JOIN players p ON p.id = s.player_id
          WHERE s.puzzle = 'five' AND s.status = 'finished' AND s.flagged = 0
          GROUP BY s.player_id HAVING COUNT(*) >= ?
          ORDER BY value DESC, count DESC`,
      )
      .all(MIN_ALLTIME_PLAYS) as unknown as Ranked[]
    const board = shape(rows, playerId)
    if (playerId && !board.me) {
      const own = this.db
        .prepare(
          `SELECT COUNT(*) AS n FROM daily_sessions
            WHERE player_id = ? AND puzzle = 'five' AND status = 'finished' AND flagged = 0`,
        )
        .get(playerId) as { n: number }
      board.progress = { have: own.n, need: MIN_ALLTIME_PLAYS }
    }
    return board
  }
}

export function leaderboardRoutes(api: Hono, context: AppContext, auth: Authentication) {
  const boards = new Leaderboards(context.db)
  // The boards are queries over every result; one address may ask for them this often.
  const reads = new RateLimiter(120, 60_000, context.now)
  api.use('/leaderboards/*', async (c, next) => {
    const ip = clientIp(c.req.header(), getConnInfo(c).remote.address, context.config)
    if (!reads.take(ip)) return c.json({ error: 'Slow down.' }, 429)
    await next()
  })
  const who = (c: Parameters<Authentication['signedIn']>[0]) => auth.signedIn(c)?.player.id ?? null

  api.get('/leaderboards/daily', (c) => {
    const puzzle = PUZZLES.find((p) => p === c.req.query('puzzle'))
    const dateKey = c.req.query('date') ?? ''
    if (!puzzle) return c.json({ error: 'No such puzzle.' }, 404)
    if (!dateAllowed(dateKey, context.now()))
      return c.json({ error: 'That is not today’s date.' }, 400)
    return c.json(boards.daily(puzzle, dailyNumber(dateKey), who(c)))
  })
  api.get('/leaderboards/duel', (c) => c.json(boards.duel(who(c))))
  api.get('/leaderboards/alltime', (c) => c.json(boards.allTime(who(c))))
  return boards
}
