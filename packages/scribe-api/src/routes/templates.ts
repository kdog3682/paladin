// @paladin/scribe-api/src/routes/templates.ts

import { Hono } from "hono"
import { eq } from "drizzle-orm"
import { db, schema } from "../db"
import { nanoid } from "nanoid"

const app = new Hono()

app.get("/", async (c) => {
  const results = await db.select().from(schema.templates).all()
  return c.json(results)
})

app.get("/:key", async (c) => {
  const template = await db.query.templates.findFirst({
    where: eq(schema.templates.key, c.req.param("key")),
  })
  if (!template) return c.json({ error: "not found" }, 404)
  return c.json(template)
})

app.post("/", async (c) => {
  const input = await c.req.json()
  const now = new Date()
  const key = input.key || nanoid(10)

  const template = {
    key,
    name: input.name,
    content: input.content,
    createdAt: now,
    modifiedAt: now,
  }

  await db.insert(schema.templates).values(template)
  return c.json(template, 201)
})

app.put("/:key", async (c) => {
  const key = c.req.param("key")
  const existing = await db.query.templates.findFirst({
    where: eq(schema.templates.key, key),
  })
  if (!existing) return c.json({ error: "not found" }, 404)

  const input = await c.req.json()
  const updated = {
    name: input.name ?? existing.name,
    content: input.content ?? existing.content,
    modifiedAt: new Date(),
  }

  await db.update(schema.templates).set(updated).where(eq(schema.templates.key, key))
  return c.json({ ...existing, ...updated })
})

app.delete("/:key", async (c) => {
  const deleted = await db
    .delete(schema.templates)
    .where(eq(schema.templates.key, c.req.param("key")))
    .returning()
  if (!deleted.length) return c.json({ error: "not found" }, 404)
  return c.json({ ok: true })
})

export default app
