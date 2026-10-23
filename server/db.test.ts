import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { openDatabase, runMigrations } from './db'

describe('database', () => {
  it('applies each migration once and remembers its place', () => {
    const db = new DatabaseSync(':memory:')
    const migrations = ['CREATE TABLE a (id INTEGER)', 'CREATE TABLE b (id INTEGER)']
    runMigrations(db, migrations.slice(0, 1))
    runMigrations(db, migrations)
    runMigrations(db, migrations)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
    expect(tables.map((t) => t.name)).toEqual(['a', 'b'])
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 2 })
  })

  it('rolls back a migration that fails', () => {
    const db = new DatabaseSync(':memory:')
    expect(() =>
      runMigrations(db, ['CREATE TABLE a (id INTEGER); INSERT INTO nope VALUES (1)']),
    ).toThrow()
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'a'").all()).toEqual([])
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 0 })
  })

  it('uses write-ahead logging on a file', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'wg-db-'))
    try {
      const db = openDatabase(join(dir, 'nested', 'game.sqlite'))
      expect(db.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' })
      db.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
