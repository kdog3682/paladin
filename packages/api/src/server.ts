// @paladin/api/src/server.ts
import { Hono } from "hono"
import { cors } from "hono/cors"
import { createBunWebSocket } from "hono/bun"
import { createWatcher } from "./watcher"
import { processFile } from "./services/fileProcessor"
import { createBroadcast } from "./broadcast"

type FileEvent = NonNullable<
  Awaited<ReturnType<typeof processFile>>
>

const app = new Hono()
app.use("*", cors())

const { upgradeWebSocket, websocket } =
  createBunWebSocket<WebSocket>()


const broadcast = createBroadcast<FileEvent>()

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

const stopWatching = createWatcher(async (path) => {
  const event = await processFile(path)
  if (event) {
    broadcast.send(event)
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

console.log(
  `Server listening on http://localhost:${server.port}`,
)

