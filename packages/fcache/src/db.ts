// @paladin/fcache/db.ts
import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { mkdirSync } from "fs"
import { cacheEntries } from "./schema"

const DB_PATH = `${process.env.HOME}/.cache/paladin/mtime-file-cache.db`

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS cache_entries (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    type TEXT NOT NULL,
    mtime INTEGER NOT NULL
  )
`

mkdirSync(`${process.env.HOME}/.cache/paladin`, { recursive: true })

const sqlite = new Database(DB_PATH)
sqlite.run(CREATE_TABLE)

export const db = drizzle(sqlite, { schema: { cacheEntries } })
