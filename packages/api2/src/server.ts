import { Hono } from "hono"
import { cors } from "hono/cors"
import { createBunWebSocket, serveStatic } from "hono/bun"
import { createWatcher } from "./watcher"
import { createBroadcast } from "./broadcast"
import { ScaffoldService } from "./services/scaffold/scaffold"
import type { ScaffoldMessage } from "./services/scaffold/events"

const IMAGE_ROOT = "/home/kdog3682/trash"

type ErrorMessage = { kind: "error"; payload: string }

const app = new Hono()
app.use("*", cors())

app.use(
  "/images/*",
  serveStatic({
    root: IMAGE_ROOT,
    onFound: (_path, c) => {
      c.header("Cache-Control", "no-store")
    },
  }),
)

const { upgradeWebSocket, websocket } = createBunWebSocket<WebSocket>()

const broadcast = createBroadcast<ScaffoldMessage | ErrorMessage>()

const scaffold = new ScaffoldService({
  // emit: (kind, payload) => broadcast.send({ kind, payload }),
})

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

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
  try {
    const result = await scaffold.dispatch(method, kwargs)
    return c.json(result)
  } catch (error) {
    const message = toMessage(error)
    broadcast.send({ kind: "error", payload: message })
    return c.json({ error: message }, 500)
  }
})

const stopWatcher = createWatcher(async (path) => {
  try {
    await scaffold.process(path)
  } catch (error) {
    console.error(`scaffold failed for ${path}`, error)
    broadcast.send({ kind: "error", payload: toMessage(error) })
  }
})

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
  websocket,
})

let shuttingDown = false

async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  stopWatcher()
  await server.stop(true)
  process.exit(0)
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

console.log(Date.now(), `@paladin/api2: server listening on http://localhost:${server.port}`)
