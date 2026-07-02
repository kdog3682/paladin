// HTTP surface the frontend calls. State lives in the session singleton; results
// and tree updates are pushed over the websocket via the event bus, so these
// handlers just acknowledge. Mount with app.route('/', routes).

import { Hono } from 'hono'
import { session } from './session'

const routes = new Hono()

routes.post('/execute', async (c) => {
  const { path, force } = await c.req.json<{ path: string; force?: boolean }>()
  const result = await session.executeFile(path, { force })
  return c.json(result)
})

routes.post('/stage', async (c) => {
  const { paths } = await c.req.json<{ paths: string[] }>()
  await session.stage(paths)
  return c.json({ ok: true })
})

routes.post('/unstage', async (c) => {
  const { paths } = await c.req.json<{ paths: string[] }>()
  await session.unstage(paths)
  return c.json({ ok: true })
})

routes.post('/commit', async (c) => {
  const { paths } = await c.req.json<{ paths: string[] }>()
  await session.commit(paths)
  return c.json({ ok: true })
})

// Watch mode: when enabled, ingested changes rerun their stale runnables.
routes.post('/autorun', async (c) => {
  const { enabled } = await c.req.json<{ enabled: boolean }>()
  session.setAutoRun(enabled)
  return c.json({ ok: true })
})

export default routes
