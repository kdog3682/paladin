// @paladin/scribe-api/src/routes/config.ts

import { Hono } from "hono"
import { eq } from "drizzle-orm"
import { db, schema } from "../db"
import { nanoid } from "nanoid"

const app = new Hono()

// ── Source Dirs ──────────────────────────────────────────────

app.get("/source-dirs", async (c) => {
  const dirs = await db.select().from(schema.sourceDirs).all()
  return c.json(dirs)
})

app.post("/source-dirs", async (c) => {
  const input = await c.req.json()

  if (!input.path) return c.json({ error: "path is required" }, 400)

  const dir = {
    id: nanoid(),
    path: input.path,
    include: input.include ?? null,
    exclude: input.exclude ?? null,
    visible: input.visible !== undefined ? Boolean(input.visible) : true,
  }

  await db.insert(schema.sourceDirs).values(dir)
  return c.json(dir, 201)
})

app.put("/source-dirs/:id", async (c) => {
  const id = c.req.param("id")
  const existing = await db.query.sourceDirs.findFirst({
    where: eq(schema.sourceDirs.id, id),
  })
  if (!existing) return c.json({ error: "not found" }, 404)

  const input = await c.req.json()
  const updated: Record<string, any> = {}

  if (input.path !== undefined) updated.path = input.path
  if (input.include !== undefined) updated.include = input.include
  if (input.exclude !== undefined) updated.exclude = input.exclude
  if (input.visible !== undefined) updated.visible = Boolean(input.visible)

  if (Object.keys(updated).length === 0) {
    return c.json(existing)
  }

  await db.update(schema.sourceDirs).set(updated).where(eq(schema.sourceDirs.id, id))
  return c.json({ ...existing, ...updated })
})

app.delete("/source-dirs/:id", async (c) => {
  const deleted = await db
    .delete(schema.sourceDirs)
    .where(eq(schema.sourceDirs.id, c.req.param("id")))
    .returning()
  if (!deleted.length) return c.json({ error: "not found" }, 404)
  return c.json({ ok: true })
})

// ── Global Filters ──────────────────────────────────────────

app.get("/global-filters", async (c) => {
  const filters = await db.query.globalFilters.findFirst({
    where: eq(schema.globalFilters.id, "singleton"),
  })
  // should always exist after init(), but guard anyway
  if (!filters) return c.json({ error: "global filters not initialized" }, 500)
  return c.json(filters)
})

app.put("/global-filters", async (c) => {
  const input = await c.req.json()

  if (input.include === undefined || input.exclude === undefined) {
    return c.json({ error: "both include and exclude are required" }, 400)
  }

  await db
    .update(schema.globalFilters)
    .set({ include: input.include, exclude: input.exclude })
    .where(eq(schema.globalFilters.id, "singleton"))

  return c.json({ id: "singleton", include: input.include, exclude: input.exclude })
})

export default app
