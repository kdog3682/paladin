// @paladin/scribe-api/src/db/schema.ts

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const tickets = sqliteTable("tickets", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default("Untitled"),
  body: text("body").notNull().default(""),
  templateKey: text("template_key"),
  status: text("status", { enum: ["active", "archived", "suspended", "completed"] })
    .notNull()
    .default("active"),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
  sourceFiles: text("source_files", { mode: "json" }).$type<string[]>().notNull().default([]),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  modifiedAt: integer("modified_at", { mode: "timestamp" }).notNull(),
})

export const templates = sqliteTable("templates", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  modifiedAt: integer("modified_at", { mode: "timestamp" }).notNull(),
})

export const fileGroups = sqliteTable("file_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  files: text("files", { mode: "json" }).$type<string[]>().notNull().default([]),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
})

export const sourceDirs = sqliteTable("source_dirs", {
  id: text("id").primaryKey(),
  path: text("path").notNull(),
  include: text("include"),
  exclude: text("exclude"),
  visible: integer("visible", { mode: "boolean" }).notNull().default(true),
})

export const globalFilters = sqliteTable("global_filters", {
  id: text("id").primaryKey().default("singleton"),
  include: text("include").notNull().default("\\.tsx?$|\\.py$|\\.rs$|\\.go$|\\.lua$|\\.sh$"),
  exclude: text("exclude").notNull().default("node_modules|dist|build|\\.config\\.|package\\.json|tsconfig|\\.lock$|\\.ico$|\\.png$|\\.jpg$|\\.svg$"),
})
