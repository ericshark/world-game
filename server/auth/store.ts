import type { Database } from '../db'
import { hashToken, randomDigits, randomId, randomToken } from './tokens'

export const SESSION_MS = 180 * 24 * 3_600_000
export const MAGIC_LINK_MS = 15 * 60_000

export interface PlayerRow {
  id: string
  nickname: string | null
  accountId: string | null
}

export interface AccountRow {
  id: string
  email: string | null
}

type Row = Record<string, unknown>

function toPlayer(row: Row | undefined): PlayerRow | null {
  return row
    ? {
        id: row.id as string,
        nickname: (row.nickname as string | null) ?? null,
        accountId: (row.account_id as string | null) ?? null,
      }
    : null
}

/** Everything the identity features read and write; one place for the SQL. */
export class AuthStore {
  private readonly db: Database
  private readonly now: () => number

  constructor(db: Database, now: () => number) {
    this.db = db
    this.now = now
  }

  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = work()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  // Players and sessions

  /** A new anonymous player with a session; returns the cookie token. */
  startAnonymous(): { player: PlayerRow; token: string } {
    return this.transaction(() => {
      const id = randomId()
      this.db.prepare('INSERT INTO players (id, created) VALUES (?, ?)').run(id, this.now())
      return { player: { id, nickname: null, accountId: null }, token: this.openSession(id) }
    })
  }

  openSession(playerId: string): string {
    const token = randomToken()
    this.db
      .prepare('INSERT INTO sessions (token_hash, player_id, expires) VALUES (?, ?, ?)')
      .run(hashToken(token), playerId, this.now() + SESSION_MS)
    return token
  }

  playerForSession(token: string): PlayerRow | null {
    const now = this.now()
    this.db.prepare('DELETE FROM sessions WHERE expires <= ?').run(now)
    return toPlayer(
      this.db
        .prepare(
          `SELECT p.* FROM sessions s JOIN players p ON p.id = s.player_id
           WHERE s.token_hash = ? AND s.expires > ?`,
        )
        .get(hashToken(token), now),
    )
  }

  endSession(token: string) {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
  }

  account(id: string | null): AccountRow | null {
    if (!id) return null
    const row = this.db.prepare('SELECT id, email FROM accounts WHERE id = ?').get(id)
    return row ? { id: row.id as string, email: (row.email as string | null) ?? null } : null
  }

  // Nicknames

  /**
   * Gives the player a nickname. A name somebody else already has gets a four-digit number
   * after it, as in "Ana#4821".
   */
  setNickname(playerId: string, name: string): string {
    return this.transaction(() => {
      const taken = (candidate: string) =>
        this.db
          .prepare('SELECT 1 FROM players WHERE nickname = ? COLLATE NOCASE AND id != ?')
          .get(candidate, playerId) !== undefined
      const own = this.db.prepare('SELECT nickname FROM players WHERE id = ?').get(playerId)
      let nickname = name
      // Keep the number already given for this name; renaming to it should not reshuffle.
      const current = (own?.nickname as string | null) ?? ''
      if (current.toLowerCase().startsWith(`${name.toLowerCase()}#`)) nickname = current
      else {
        while (taken(nickname)) nickname = `${name}#${randomDigits(4)}`
      }
      this.db.prepare('UPDATE players SET nickname = ? WHERE id = ?').run(nickname, playerId)
      return nickname
    })
  }

  // Accounts

  /** Finds the account for a verified email or provider id, making one if needed. */
  accountFor(identity: {
    email: string | null
    provider?: { column: 'google_id' | 'github_id'; subject: string }
  }): AccountRow {
    return this.transaction(() => {
      const email = identity.email?.toLowerCase() ?? null
      const { provider } = identity
      let found = provider
        ? this.db
            .prepare(`SELECT id, email FROM accounts WHERE ${provider.column} = ?`)
            .get(provider.subject)
        : undefined
      if (!found && email) {
        found = this.db.prepare('SELECT id, email FROM accounts WHERE email = ?').get(email)
      }
      let id = found?.id as string | undefined
      if (!id) {
        id = randomId()
        this.db
          .prepare('INSERT INTO accounts (id, email, created) VALUES (?, ?, ?)')
          .run(id, email, this.now())
      }
      if (provider) {
        this.db
          .prepare(`UPDATE accounts SET ${provider.column} = ? WHERE id = ?`)
          .run(provider.subject, id)
      }
      if (email) {
        this.db
          .prepare('UPDATE accounts SET email = ? WHERE id = ? AND email IS NULL')
          .run(email, id)
      }
      return this.account(id)!
    })
  }

  /**
   * Signs the session's player in to an account. The account's own player takes over the
   * session; a new account adopts the anonymous player, nickname and all. Returns the player
   * now in use.
   */
  signIn(sessionToken: string, current: PlayerRow, accountId: string): PlayerRow {
    return this.transaction(() => {
      const existing = toPlayer(
        this.db
          .prepare('SELECT * FROM players WHERE account_id = ? ORDER BY created LIMIT 1')
          .get(accountId),
      )
      let target = existing
      if (!target) {
        if (current.accountId === null) {
          this.db
            .prepare('UPDATE players SET account_id = ? WHERE id = ?')
            .run(accountId, current.id)
          target = { ...current, accountId }
        } else {
          const id = randomId()
          this.db
            .prepare('INSERT INTO players (id, account_id, created) VALUES (?, ?, ?)')
            .run(id, accountId, this.now())
          target = { id, nickname: null, accountId }
        }
      }
      if (target.id !== current.id) {
        this.db
          .prepare('UPDATE sessions SET player_id = ? WHERE token_hash = ?')
          .run(target.id, hashToken(sessionToken))
        // An anonymous player left behind has nothing worth keeping once it is merged.
        if (current.accountId === null) this.mergeAnonymous(current.id, target.id)
      }
      return target
    })
  }

  /** Moves an abandoned anonymous player's records to the player that replaces it. */
  private mergeAnonymous(fromId: string, toId: string) {
    // A puzzle both have played stays with the account's player; the rest moves over.
    this.db
      .prepare('UPDATE OR IGNORE daily_sessions SET player_id = ? WHERE player_id = ?')
      .run(toId, fromId)
    this.db.prepare('DELETE FROM players WHERE id = ?').run(fromId)
  }

  /** Erases a player and, if signed in, the whole account with its cloud profile. */
  deleteEverything(player: PlayerRow) {
    this.transaction(() => {
      if (player.accountId) {
        this.db.prepare('DELETE FROM players WHERE account_id = ?').run(player.accountId)
        this.db.prepare('DELETE FROM accounts WHERE id = ?').run(player.accountId)
      } else {
        this.db.prepare('DELETE FROM players WHERE id = ?').run(player.id)
      }
    })
  }

  // Magic links

  /** Stores a one-time sign-in token for an email and returns it. */
  createMagicLink(email: string): string {
    const token = randomToken()
    this.db
      .prepare('INSERT INTO magic_links (token_hash, email, expires) VALUES (?, ?, ?)')
      .run(hashToken(token), email.toLowerCase(), this.now() + MAGIC_LINK_MS)
    return token
  }

  /** Spends a magic link; the email it was sent to, or null if unknown, used or expired. */
  consumeMagicLink(token: string): string | null {
    const now = this.now()
    this.db.prepare('DELETE FROM magic_links WHERE expires <= ?').run(now)
    const row = this.db
      .prepare(
        'UPDATE magic_links SET used = 1 WHERE token_hash = ? AND used = 0 AND expires > ? RETURNING email',
      )
      .get(hashToken(token), now)
    return row ? (row.email as string) : null
  }

  // Cloud profiles

  profile(accountId: string): { json: string; version: number; updated: number } | null {
    const row = this.db
      .prepare('SELECT json, version, updated FROM profiles WHERE account_id = ?')
      .get(accountId)
    return row
      ? { json: row.json as string, version: row.version as number, updated: row.updated as number }
      : null
  }

  /**
   * Saves a profile if the caller saw the latest version (0 means none yet). Returns the new
   * version, or null when somebody else saved first.
   */
  saveProfile(accountId: string, json: string, baseVersion: number): number | null {
    return this.transaction(() => {
      const current = this.profile(accountId)?.version ?? 0
      if (current !== baseVersion) return null
      this.db
        .prepare(
          `INSERT INTO profiles (account_id, json, version, updated) VALUES (?, ?, ?, ?)
           ON CONFLICT (account_id) DO UPDATE SET json = excluded.json,
             version = excluded.version, updated = excluded.updated`,
        )
        .run(accountId, json, current + 1, this.now())
      return current + 1
    })
  }
}
