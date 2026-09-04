/*
 * SQLite connection and migration.
 *
 * Uses node:sqlite (built into Node >= 22.5), which is why the agent needs no
 * database driver dependency. This module and storage/repositories.ts are the
 * only places SQL is written; pipeline code calls repository functions so the
 * eventual Postgres swap (NEWS_AGENT.md §9) touches this directory alone.
 */

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { storageError } from '../domain/errors.ts'
import { MIGRATIONS } from './schema.ts'

export type Db = DatabaseSync

/** SQLite accepts no `undefined`; every optional value is normalised to null. */
export type SqlValue = string | number | bigint | null | Uint8Array

export function toSql(value: unknown): SqlValue {
  if (value === undefined || value === null) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string') return value
  if (value instanceof Uint8Array) return value
  return JSON.stringify(value)
}

export function fromJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value === '') return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function toBool(value: unknown): boolean {
  return value === 1 || value === true || value === '1'
}

/** Reads a column that may legitimately be absent, without leaking `null`. */
export function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

export function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

export interface OpenDbOptions {
  /** File path, or ':memory:' for tests. */
  path: string
}

export function openDatabase({ path }: OpenDbOptions): Db {
  const isMemory = path === ':memory:'
  const location = isMemory ? path : resolve(path)

  if (!isMemory) {
    try {
      mkdirSync(dirname(location), { recursive: true })
    } catch (cause) {
      throw storageError(`Could not create database directory for ${location}`, cause)
    }
  }

  let db: DatabaseSync
  try {
    db = new DatabaseSync(location)
  } catch (cause) {
    throw storageError(`Could not open SQLite database at ${location}`, cause)
  }

  try {
    // WAL keeps a crashed run from leaving the file locked for the next one.
    if (!isMemory) db.exec('PRAGMA journal_mode = WAL;')
    db.exec('PRAGMA foreign_keys = ON;')
    db.exec('PRAGMA busy_timeout = 5000;')
    migrate(db)
  } catch (cause) {
    db.close()
    throw cause
  }

  return db
}

function migrate(db: Db): void {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `)

    const applied = new Set(
      (db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map(
        (row) => row.version,
      ),
    )

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue
      db.exec('BEGIN')
      try {
        db.exec(migration.sql)
        db.prepare(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
        ).run(migration.version, migration.name, new Date().toISOString())
        db.exec('COMMIT')
      } catch (cause) {
        db.exec('ROLLBACK')
        throw storageError(`Migration ${migration.version} (${migration.name}) failed`, cause)
      }
    }
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'AgentError') throw cause
    throw storageError('Schema migration failed', cause)
  }
}

/**
 * Runs `fn` inside a transaction.
 *
 * BEGIN IMMEDIATE takes the write lock up front so two agent processes cannot
 * both believe they won the run lock (§23).
 */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (cause) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // A failed rollback must not mask the original error.
    }
    throw cause
  }
}
