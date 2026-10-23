import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export type Database = DatabaseSync

/**
 * Numbered migrations, applied in order and never edited once released. The database's
 * `user_version` records how many have run.
 */
export const MIGRATIONS: readonly string[] = [
  `CREATE TABLE accounts (
     id TEXT PRIMARY KEY,
     email TEXT UNIQUE,
     google_id TEXT UNIQUE,
     github_id TEXT UNIQUE,
     created INTEGER NOT NULL
   );
   CREATE TABLE players (
     id TEXT PRIMARY KEY,
     nickname TEXT,
     account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
     created INTEGER NOT NULL
   );
   CREATE UNIQUE INDEX players_nickname ON players (nickname COLLATE NOCASE) WHERE nickname IS NOT NULL;
   CREATE INDEX players_account ON players (account_id);
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
     expires INTEGER NOT NULL
   );
   CREATE INDEX sessions_player ON sessions (player_id);
   CREATE TABLE magic_links (
     token_hash TEXT PRIMARY KEY,
     email TEXT NOT NULL,
     expires INTEGER NOT NULL,
     used INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE profiles (
     account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
     json TEXT NOT NULL,
     version INTEGER NOT NULL,
     updated INTEGER NOT NULL
   );`,
  `CREATE TABLE daily_sessions (
     player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
     number INTEGER NOT NULL,
     puzzle TEXT NOT NULL,
     state TEXT NOT NULL,
     status TEXT NOT NULL,
     score INTEGER,
     flagged INTEGER NOT NULL DEFAULT 0,
     last_event INTEGER NOT NULL,
     started INTEGER NOT NULL,
     finished INTEGER,
     PRIMARY KEY (player_id, number, puzzle)
   );
   CREATE INDEX daily_sessions_board ON daily_sessions (number, puzzle, status, score DESC);
   CREATE TABLE daily_answers (
     number INTEGER NOT NULL,
     country_id TEXT NOT NULL,
     count INTEGER NOT NULL,
     PRIMARY KEY (number, country_id)
   );`,
]

export function runMigrations(db: Database, migrations: readonly string[] = MIGRATIONS) {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
  for (let version = row.user_version; version < migrations.length; version++) {
    db.exec('BEGIN')
    try {
      db.exec(migrations[version])
      db.exec(`PRAGMA user_version = ${version + 1}`)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}

/** Opens (creating if needed) the database in WAL mode and brings its schema up to date. */
export function openDatabase(path: string): Database {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  runMigrations(db)
  return db
}
