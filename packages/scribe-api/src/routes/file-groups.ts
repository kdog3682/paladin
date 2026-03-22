// @paladin/scribe-api/src/routes/file-groups.ts

import { Hono } from "hono"
import { eq } from "drizzle-orm"
import { db, schema } from "../db"
import { nanoid } from "nanoid"

const app = new Hono()

app.get("/", async (c) => {
  const results = await db.select().from(schema.fileGroups).all()
  return c.json(results)
})

app.get("/:id", async (c) => {
  const group = await db.query.fileGroups.findFirst({
    where: eq(schema.fileGroups.id, c.req.param("id")),
  })
  if (!group) return c.json({ error: "not found" }, 404)
  return c.json(group)
})

app.post("/", async (c) => {
  const input = await c.req.json()
  const now = new Date()

  const group = {
    id: nanoid(),
    name: input.name || "Unnamed Group",
    files: input.files || [],
    createdAt: now,
  }

  await db.insert(schema.fileGroups).values(group)
  return c.json(group, 201)
})

app.put("/:id", async (c) => {
  const id = c.req.param("id")
  const existing = await db.query.fileGroups.findFirst({
    where: eq(schema.fileGroups.id, id),
  })
  if (!existing) return c.json({ error: "not found" }, 404)

  const input = await c.req.json()
  const updated = {
    name: input.name ?? existing.name,
    files: input.files ?? existing.files,
  }

  await db.update(schema.fileGroups).set(updated).where(eq(schema.fileGroups.id, id))
  return c.json({ ...existing, ...updated })
})

app.delete("/:id", async (c) => {
  const deleted = await db
    .delete(schema.fileGroups)
    .where(eq(schema.fileGroups.id, c.req.param("id")))
    .returning()
  if (!deleted.length) return c.json({ error: "not found" }, 404)
  return c.json({ ok: true })
})

export default app
