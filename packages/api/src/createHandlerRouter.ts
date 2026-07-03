import { Hono } from 'hono'

type Handler = (kwargs: any) => Promise<unknown> | unknown
type Handlers = Record<string, Handler>

export function createHandlerRouter(handlers: Handlers) {
  const router = new Hono()

  router.post('/', async (c) => {
    const { method, kwargs = {} } = await c.req.json()
    const handler = handlers[method]
    if (!handler) {
      return c.json({ error: `Unknown method '${method}'` }, 400)
    }
    try {
      return c.json(await handler(kwargs))
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
    }
  })

  return router
}
