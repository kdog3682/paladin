// src/routes/ticket.ts

import { Hono } from 'hono'
import * as ticket from '../services/ticket'

const app = new Hono()

// GET /ticket?days=7
app.get('/', (c) => {
  const days = Number(c.req.query('days') ?? 7)
  return c.json(ticket.list(days))
})

// GET /ticket/:name
app.get('/:name', (c) => {
  const t = ticket.get(c.req.param('name'))
  if (!t) return c.json({ error: 'not found' }, 404)
  return c.json(t)
})

// POST /ticket
// body: { fileSource: { type, name }, files: [{ path, notes? }] }
app.post('/', async (c) => {
  const body = await c.req.json()
  const t = ticket.create(body)
  return c.json(t, 201)
})

// PATCH /ticket/:name/notes
// body: { files: [{ path, notes: string[] }] }
app.patch('/:name/notes', async (c) => {
  const name = c.req.param('name')
  const { files } = await c.req.json()
  ticket.updateNotes(name, files)
  return c.json(ticket.get(name))
})

// POST /ticket/:name/files
// body: { path, notes? }
app.post('/:name/files', async (c) => {
  const name = c.req.param('name')
  const { path, notes } = await c.req.json()
  ticket.addFile(name, path, notes)
  return c.json(ticket.get(name))
})

// POST /ticket/:name/clear
app.post('/:name/clear', (c) => {
  const name = c.req.param('name')
  ticket.clearNotes(name)
  return c.json({ ok: true })
})

// POST /ticket/:name/save
app.post('/:name/save', (c) => {
  const t = ticket.save(c.req.param('name'))
  if (!t) return c.json({ error: 'not found' }, 404)
  return c.json(t)
})

// POST /ticket/:name/export
// body: { promptDir? }
app.post('/:name/export', async (c) => {
  const name = c.req.param('name')
  const { promptDir } = await c.req.json().catch(() => ({}))
  const payload = await ticket.exportPayload(name, promptDir)
  if (!payload) return c.json({ error: 'not found' }, 404)
  return c.json({ payload })
})

// DELETE /ticket/:name
app.delete('/:name', (c) => {
  const deleted = ticket.deleteTicket(c.req.param('name'))
  if (!deleted) return c.json({ error: 'not found' }, 404)
  return c.json({ ok: true })
})

export default app
