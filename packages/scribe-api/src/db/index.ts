// @paladin/scribe-api/src/db/index.ts

import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import * as schema from "./schema"
import { join } from "path"

const sqlite = new Database("scribe.db")
sqlite.exec("PRAGMA journal_mode = WAL")

export const db = drizzle(sqlite, { schema })

migrate(db, { migrationsFolder: join(import.meta.dir, "../../drizzle") })

export { schema }
