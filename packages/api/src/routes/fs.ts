// src/routes/fs.ts

import { Hono } from 'hono'
import * as fs from '../services/fs'

const app = new Hono()

// POST /fs/read
// body: { path }
app.post('/read', async (c) => {
  const { path } = await c.req.json()
  const content = await fs.read(path)
  return c.json({ content })
})

// POST /fs/write
// body: { path, content }
app.post('/write', async (c) => {
  const { path, content } = await c.req.json()
  await fs.write(path, content)
  return c.json({ ok: true })
})

// POST /fs/move
// body: { src, dest }
app.post('/move', async (c) => {
  const { src, dest } = await c.req.json()
  await fs.move(src, dest)
  return c.json({ ok: true })
})

// POST /fs/rename
// body: { src, newName }
app.post('/rename', async (c) => {
  const { src, newName } = await c.req.json()
  await fs.renameFile(src, newName)
  return c.json({ ok: true })
})

// POST /fs/delete
// body: { path }
app.post('/delete', async (c) => {
  const { path } = await c.req.json()
  await fs.remove(path)
  return c.json({ ok: true })
})

// POST /fs/exists
// body: { path }
app.post('/exists', async (c) => {
  const { path } = await c.req.json()
  const result = await fs.exists(path)
  return c.json({ exists: result })
})

// POST /fs/list
// body: { dir, recursive?, glob? }
app.post('/list', async (c) => {
  const { dir, recursive, glob } = await c.req.json()
  const files = await fs.list(dir, { recursive, glob })
  return c.json(files)
})

// POST /fs/readdir
// body: { dir }
app.post('/readdir', async (c) => {
  const { dir } = await c.req.json()
  const entries = await fs.readDir(dir)
  return c.json(entries)
})

// POST /fs/mkdir
// body: { path }
app.post('/mkdir', async (c) => {
  const { path } = await c.req.json()
  await fs.ensureDir(path)
  return c.json({ ok: true })
})

// POST /fs/info
// body: { path }
app.post('/info', async (c) => {
  const { path } = await c.req.json()
  const info = await fs.fileInfo(path)
  return c.json(info)
})

export default app
