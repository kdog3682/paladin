// src/routes/source.ts

import { Hono } from 'hono'
import * as source from '../services/source'

const app = new Hono()

// GET /source
// returns all available sources (git modified, filegroups)
// used by cmd+n fzf picker
app.get('/', async (c) => {
  const sources = await source.listSources()
  return c.json(sources)
})

// POST /source/files
// body: { type, name, sourceOnly? }
// resolves a source to its file list
app.post('/files', async (c) => {
  const { type, name, sourceOnly } = await c.req.json()
  const files = await source.getSourceFiles(type, name, { sourceOnly })
  return c.json(files)
})

// --- filegroup CRUD ---

// GET /source/filegroup
app.get('/filegroup', (c) => {
  return c.json(source.listFilegroups())
})

// GET /source/filegroup/:name
app.get('/filegroup/:name', (c) => {
  const group = source.getFilegroup(c.req.param('name'))
  if (!group) return c.json({ error: 'not found' }, 404)
  return c.json(group)
})

// GET /source/filegroup/:name/files
app.get('/filegroup/:name/files', (c) => {
  const files = source.getFilegroupFiles(c.req.param('name'))
  if (!files) return c.json({ error: 'not found' }, 404)
  return c.json(files)
})

// POST /source/filegroup
// body: { name, paths }
app.post('/filegroup', async (c) => {
  const { name, paths } = await c.req.json()
  const group = source.createFilegroup(name, paths)
  return c.json(group, 201)
})

// PATCH /source/filegroup/:name
// body: { paths }
app.patch('/filegroup/:name', async (c) => {
  const name = c.req.param('name')
  const { paths } = await c.req.json()
  const group = source.updateFilegroup(name, paths)
  if (!group) return c.json({ error: 'not found' }, 404)
  return c.json(group)
})

// DELETE /source/filegroup/:name
app.delete('/filegroup/:name', (c) => {
  const deleted = source.deleteFilegroup(c.req.param('name'))
  if (!deleted) return c.json({ error: 'not found' }, 404)
  return c.json({ ok: true })
})

export default app
