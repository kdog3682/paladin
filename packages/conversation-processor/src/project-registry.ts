// @paladin/conversation-processor/project-registry.ts

import { mkdirSync } from "fs"
import { dirname, join } from "path"
import { Database } from "bun:sqlite"
import { paladinPath } from "./utils/paladin-path"
import type { ConversationRef } from "./types"

export type ProjectRegistry = {
  getRefs(projectName: string): ConversationRef[]
  addRef(projectName: string, ref: ConversationRef): void
  exists(projectName: string): boolean
  close(): void
}

export function createProjectRegistry(storageRoot?: string): ProjectRegistry {
  const dbPath = storageRoot
    ? join(storageRoot, "db", "projects.sqlite")
    : paladinPath("db", "projects.sqlite")

  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath, { create: true })

  db.run(`
    CREATE TABLE IF NOT EXISTS conversation_refs (
      project_name TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_name, conversation_id)
    )
  `)

  const getStmt = db.prepare(`
    SELECT conversation_id, url, title, updated_at
    FROM conversation_refs
    WHERE project_name = ?
    ORDER BY updated_at DESC
  `)

  const upsertStmt = db.prepare(`
    INSERT INTO conversation_refs (project_name, conversation_id, url, title, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (project_name, conversation_id)
    DO UPDATE SET
      url = excluded.url,
      title = excluded.title,
      updated_at = excluded.updated_at
  `)

  const existsStmt = db.prepare(`
    SELECT 1 FROM conversation_refs WHERE project_name = ? LIMIT 1
  `)

  return {
    getRefs(projectName) {
      const rows = getStmt.all(projectName) as any[]
      return rows.map(r => ({
        id: r.conversation_id,
        url: r.url,
        title: r.title,
        updatedAt: r.updated_at,
      }))
    },

    addRef(projectName, ref) {
      upsertStmt.run(projectName, ref.id, ref.url, ref.title, ref.updatedAt)
    },

    exists(projectName) {
      return !!existsStmt.get(projectName)
    },

    close() {
      db.close()
    },
  }
}
