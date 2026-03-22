// @paladin/scribe-api/src/routes/files.ts

import { Hono } from "hono"
import { readFile } from "node:fs/promises"
import { basename, resolve } from "node:path"
import { db, schema } from "../db"
import { eq } from "drizzle-orm"
import { walkDir, safeRegex } from "../lib/file-tree"
import { fuzzySearch } from "../lib/fuzzy"

const app = new Hono()

// get file tree for configured source dirs
app.get("/tree", async (c) => {
  const sourceDirs = await db.select().from(schema.sourceDirs).all()
  const visible = sourceDirs.filter((d) => d.visible)

  const globalRow = await db.query.globalFilters.findFirst({
    where: eq(schema.globalFilters.id, "singleton"),
  })
  const globalIncludeRe = safeRegex(globalRow?.include)
  const globalExcludeRe = safeRegex(globalRow?.exclude)

  const trees = await Promise.all(
    visible.map(async (dir) => {
      const includeRe = safeRegex(dir.include)
      const excludeRe = safeRegex(dir.exclude)
      const children = await walkDir(dir.path, includeRe, excludeRe, globalIncludeRe, globalExcludeRe)
      return { path: dir.path, name: basename(dir.path), type: "directory" as const, children }
    })
  )

  return c.json(trees)
})

// read single file — scoped to configured source dirs
app.get("/read", async (c) => {
  const path = c.req.query("path")
  if (!path) return c.json({ error: "path required" }, 400)

  const resolved = resolve(path)
  const sourceDirs = await db.select().from(schema.sourceDirs).all()
  const allowed = sourceDirs.some((d) => resolved.startsWith(resolve(d.path)))

  if (!allowed) return c.json({ error: "path outside configured source dirs" }, 403)

  const content = await readFile(resolved, "utf-8")
  return c.json({ path: resolved, content })
})

// fuzzy search
app.get("/search", async (c) => {
  const q = c.req.query("q")
  if (!q) return c.json([])

  const results = await fuzzySearch(q)
  return c.json(results)
})

export default app
