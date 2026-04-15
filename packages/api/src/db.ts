// src/db.ts

import { Database } from 'bun:sqlite'
import { join } from 'path'

const DB_PATH = join(import.meta.dir, '..', 'data', 'paladin.db')

let _db: Database | null = null

export function getDb(): Database {
  if (!_db) {
    _db = new Database(DB_PATH, { create: true })
    _db.exec('PRAGMA journal_mode = WAL')
    _db.exec('PRAGMA foreign_keys = ON')
    migrate(_db)
  }
  return _db
}

function migrate(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      name TEXT PRIMARY KEY,
      keywords TEXT NOT NULL DEFAULT '[]',
      file_source_type TEXT NOT NULL,
      file_source_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS filegroups (
      name TEXT PRIMARY KEY,
      paths TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_files (
      ticket_name TEXT NOT NULL,
      path TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY (ticket_name, path),
      FOREIGN KEY (ticket_name) REFERENCES tickets(name) ON DELETE CASCADE
    )
  `)
}

export function closeDb() {
  if (_db) {
    _db.close()
    _db = null
  }
}
