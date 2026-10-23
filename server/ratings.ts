import type { Database } from './db'
import { NEW_RATING, type Rating } from './glicko2'

export interface StoredRating extends Rating {
  games: number
}

/** A player's rating, or the starting one if they have not played a rated game. */
export function loadRating(db: Database, playerId: string): StoredRating {
  const row = db
    .prepare('SELECT rating, rd, vol, games FROM ratings WHERE player_id = ?')
    .get(playerId) as unknown as StoredRating | undefined
  return row ? { ...row } : { ...NEW_RATING, games: 0 }
}

export function saveRating(db: Database, playerId: string, next: StoredRating, now: number) {
  db.prepare(
    `INSERT INTO ratings (player_id, rating, rd, vol, games, updated) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (player_id) DO UPDATE SET rating = excluded.rating, rd = excluded.rd,
       vol = excluded.vol, games = excluded.games, updated = excluded.updated`,
  ).run(playerId, next.rating, next.rd, next.vol, next.games, now)
}

/** Rated games between these two in the last day, whoever was which. */
export function ratedGamesBetween(db: Database, a: string, b: string, since: number): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM matches WHERE rated = 1 AND played > ?
         AND ((player_a = ? AND player_b = ?) OR (player_a = ? AND player_b = ?))`,
    )
    .get(since, a, b, b, a) as { n: number }
  return row.n
}

export function recordMatch(
  db: Database,
  match: {
    playerA: string
    playerB: string | null
    scoreA: number
    rated: boolean
    reason?: string
  },
  now: number,
) {
  db.prepare(
    'INSERT INTO matches (played, player_a, player_b, score_a, rated, reason) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(now, match.playerA, match.playerB, match.scoreA, match.rated ? 1 : 0, match.reason ?? null)
}
