// src/routes/git.ts

import { Hono } from 'hono'
import * as git from '../services/git'

const app = new Hono()

// POST /git/repo
// body: { rootDir, autoInit? }
app.post('/repo', async (c) => {
  const { rootDir } = await c.req.json()
  await git.setRepo(rootDir)
  return c.json({ ok: true })
})

// GET /git/data
app.get('/data', async (c) => {
  const data = await git.getData()
  return c.json(data)
})

// POST /git/add
// body: { pathspec? }
app.post('/add', async (c) => {
  const { pathspec } = await c.req.json().catch(() => ({}))
  await git.add(pathspec)
  return c.json({ ok: true })
})

// POST /git/commit
// body: { message }
app.post('/commit', async (c) => {
  const { message } = await c.req.json()
  await git.commit(message)
  return c.json({ ok: true })
})

// POST /git/push
// body: { remote?, branch? }
app.post('/push', async (c) => {
  const { remote, branch } = await c.req.json().catch(() => ({}))
  await git.push(remote, branch)
  return c.json({ ok: true })
})

// POST /git/pull
// body: { remote?, branch? }
app.post('/pull', async (c) => {
  const { remote, branch } = await c.req.json().catch(() => ({}))
  await git.pull(remote, branch)
  return c.json({ ok: true })
})

// GET /git/log?limit=20
app.get('/log', async (c) => {
  const limit = Number(c.req.query('limit') ?? 20)
  const entries = await git.log({ limit })
  return c.json(entries)
})

// GET /git/commit/:hash/files
app.get('/commit/:hash/files', async (c) => {
  const files = await git.getFilesForCommit(c.req.param('hash'))
  return c.json(files)
})

// GET /git/commit/:hash/file?path=...
app.get('/commit/:hash/file', async (c) => {
  const path = c.req.query('path')
  if (!path) return c.json({ error: 'path required' }, 400)
  const content = await git.getFileAtCommit(c.req.param('hash'), path)
  return c.json({ content })
})

// POST /git/restore
// body: { commitHash, filePaths }
app.post('/restore', async (c) => {
  const { commitHash, filePaths } = await c.req.json()
  await git.restoreFiles(commitHash, filePaths)
  return c.json({ ok: true })
})

// GET /git/diff?ref=...
app.get('/diff', async (c) => {
  const ref = c.req.query('ref')
  const output = await git.diff(ref || undefined)
  return c.json({ diff: output })
})

// GET /git/diff/staged
app.get('/diff/staged', async (c) => {
  const output = await git.diffStaged()
  return c.json({ diff: output })
})

export default app
