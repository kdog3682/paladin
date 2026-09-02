import { Hono } from "hono"
import { cors } from "hono/cors"
import { createBunWebSocket } from "hono/bun"
import { createWatcher } from "./watcher"
import { createBroadcast } from "./broadcast"
import { keep, replace, onSignal, disposeAll } from "./hot"
import { ScaffoldService } from "./services/scaffold/scaffold"
import type { ScaffoldMessage } from "./services/scaffold/events"
import { serveStatic } from "hono/bun"
import { resolve } from "node:path"

const app = new Hono()
app.use("*", cors())

const IMAGE_ROOT = '/home/kdog3682/trash'
app.use(
  "/images/*",
  serveStatic({
    // root: resolve(import.meta.dir, "../public"),
    root: IMAGE_ROOT,
    onFound: (_path, c) => {
      c.header("Cache-Control", "no-store")
    },
  }),
)

const { upgradeWebSocket, websocket } = createBunWebSocket<WebSocket>()

type ErrorMessage = { kind: "error"; payload: string }

const broadcast = keep("broadcast", () => createBroadcast<ScaffoldMessage | ErrorMessage>())

const scaffold = keep(
  "scaffold",
  () =>
    new ScaffoldService({
      // emit: (kind, payload) => broadcast.send({ kind, payload }),
    }),
)

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
    const message = error instanceof Error ? error.message : String(error)
    broadcast.send({ kind: "error", payload: message })
    return c.json({ error: message }, 500)
  }
})

replace(
  "watcher",
  () =>
    createWatcher(async (path) => {
      try {
        await scaffold.process(path)
      } catch (error) {
        console.error(`scaffold failed for ${path}`, error)
        broadcast.send({ kind: "error", payload: error instanceof Error ? error.message : String(error) })
      }
    }),
  (stop) => stop(),
)

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
  websocket,
})

async function shutdown() {
  await disposeAll()
  await server.stop(true)
}

onSignal(["SIGINT", "SIGTERM"], shutdown)

console.log(`@paladin/api2: server listening on http://localhost:${server.port}`)
