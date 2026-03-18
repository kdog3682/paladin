// @paladin/project-viewer-backend/src/routes/sessions.ts
import { Hono } from "hono"
import {
  listSessions,
  getSession,
  saveSession,
  deleteSession,
  type Session,
} from "../lib/storage"

export const sessions = new Hono()

// GET /sessions?repo=org/name
sessions.get("/", async (c) => {
  const repo = c.req.query("repo")
  const all = await listSessions(repo)
  return c.json(all)
})

// GET /sessions/:id
sessions.get("/:id", async (c) => {
  const id = c.req.param("id")
  const session = await getSession(id)
  if (!session) return c.json({ error: "not found" }, 404)
  return c.json(session)
})

// POST /sessions
sessions.post("/", async (c) => {
  const body = await c.req.json<Session>()
  if (!body.id) {
    body.id = crypto.randomUUID()
  }
  if (!body.created) {
    body.created = new Date().toISOString()
  }
  await saveSession(body)
  return c.json(body)
})

// PUT /sessions/:id
sessions.put("/:id", async (c) => {
  const id = c.req.param("id")
  const body = await c.req.json<Partial<Session>>()
  const existing = await getSession(id)
  if (!existing) return c.json({ error: "not found" }, 404)

  const merged = { ...existing, ...body, id }
  await saveSession(merged)
  return c.json(merged)
})

// DELETE /sessions/:id
sessions.delete("/:id", async (c) => {
  const id = c.req.param("id")
  await deleteSession(id)
  return c.json({ ok: true })
})
