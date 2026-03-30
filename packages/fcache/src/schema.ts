// @paladin/fcache/schema.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const cacheEntries = sqliteTable("cache_entries", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  type: text("type").notNull(),
  mtime: integer("mtime").notNull(),
})
