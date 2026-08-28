import { Hono } from "hono"
import { cors } from "hono/cors"
import { createBunWebSocket } from "hono/bun"
import { createWatcher } from "./watcher"
import { createBroadcast } from "./broadcast"
import { ScaffoldService } from "./services/scaffold/scaffold"
import type { ScaffoldMessage } from "./services/scaffold/events"

const app = new Hono()
app.use("*", cors())

const { upgradeWebSocket, websocket } = createBunWebSocket<WebSocket>()

const broadcast = createBroadcast<ScaffoldMessage>()

const scaffold = new ScaffoldService({
  emit: (kind, payload) => broadcast.send({ kind, payload }),
})

app.get(
  "/ws",
  upgradeWebSocket(() => ({
    onOpen(_event, ws) {
      broadcast.add(ws)
    },
    onClose(_event, ws) {
      broadcast.remove(ws)
    },
  })),
)

app.post("/controller", async (c) => {
  const { method, kwargs } = await c.req.json()
  const result = await scaffold.dispatch(method, kwargs)
  return c.json(result)
})

const stopWatching = createWatcher(async (path) => {
  try {
    await scaffold.process(path)
  } catch (error) {
    console.error(`scaffold failed for ${path}`, error)
  }
})

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
  websocket,
})

function shutdown() {
  stopWatching()
  server.stop()
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

console.log(`Server listening on http://localhost:${server.port}`)
