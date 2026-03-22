// @paladin/scribe-api/src/routes/tickets.ts

import { Hono } from "hono"
import { eq, like, and, sql } from "drizzle-orm"
import { db, schema } from "../db"
import { generateTags } from "../lib/tags"
import { determineTicketName } from "../lib/helpers"
import { nanoid } from "nanoid"

const app = new Hono()

// list tickets
app.get("/", async (c) => {
  const { status, tag, q } = c.req.query()

  let results = await db.select().from(schema.tickets).all()

  if (status) {
    results = results.filter((t) => t.status === status)
  }
  if (tag) {
    results = results.filter((t) => t.tags.includes(tag))
  }
  if (q) {
    const lower = q.toLowerCase()
    results = results.filter(
      (t) => t.name.toLowerCase().includes(lower) || t.body.toLowerCase().includes(lower)
    )
  }

  results.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime())
  return c.json(results)
})

// get ticket
app.get("/:id", async (c) => {
  const ticket = await db.query.tickets.findFirst({
    where: eq(schema.tickets.id, c.req.param("id")),
  })
  if (!ticket) return c.json({ error: "not found" }, 404)
  return c.json(ticket)
})

// create ticket
app.post("/", async (c) => {
  const input = await c.req.json()
  const now = new Date()
  const id = nanoid()

  const name =
    !input.name || input.name === "Untitled"
      ? await determineTicketName(input.body || "")
      : input.name

  const tags = await generateTags(input.body || "", input.sourceFiles || [])

  const ticket = {
    id,
    name: name || "Untitled",
    body: input.body || "",
    templateKey: input.templateKey || null,
    status: input.status || "active",
    tags,
    sourceFiles: input.sourceFiles || [],
    createdAt: now,
    modifiedAt: now,
  }

  await db.insert(schema.tickets).values(ticket)
  return c.json(ticket, 201)
})

// update ticket
app.put("/:id", async (c) => {
  const id = c.req.param("id")
  const existing = await db.query.tickets.findFirst({
    where: eq(schema.tickets.id, id),
  })
  if (!existing) return c.json({ error: "not found" }, 404)

  const input = await c.req.json()
  const now = new Date()

  const body = input.body ?? existing.body
  const sourceFiles = input.sourceFiles ?? existing.sourceFiles
  const tags = await generateTags(body, sourceFiles)

  const updated = {
    name: input.name ?? existing.name,
    body,
    templateKey: input.templateKey ?? existing.templateKey,
    status: input.status ?? existing.status,
    tags,
    sourceFiles,
    modifiedAt: now,
  }

  await db.update(schema.tickets).set(updated).where(eq(schema.tickets.id, id))
  return c.json({ ...existing, ...updated })
})

// delete ticket
app.delete("/:id", async (c) => {
  const id = c.req.param("id")
  const deleted = await db.delete(schema.tickets).where(eq(schema.tickets.id, id)).returning()
  if (!deleted.length) return c.json({ error: "not found" }, 404)
  return c.json({ ok: true })
})

// duplicate ticket
app.post("/:id/duplicate", async (c) => {
  const existing = await db.query.tickets.findFirst({
    where: eq(schema.tickets.id, c.req.param("id")),
  })
  if (!existing) return c.json({ error: "not found" }, 404)

  const now = new Date()
  const ticket = {
    id: nanoid(),
    name: `${existing.name} (copy)`,
    body: existing.body,
    templateKey: existing.templateKey,
    status: "active" as const,
    tags: existing.tags,
    sourceFiles: existing.sourceFiles,
    createdAt: now,
    modifiedAt: now,
  }

  await db.insert(schema.tickets).values(ticket)
  return c.json(ticket, 201)
})

export default app
