// @paladin/api/src/server.ts

import { Hono } from "hono"
import { cors } from "hono/cors"
import { createBunWebSocket } from "hono/bun"

// import routes from "./routes"
import { cmeRoute } from "./cme/router"

import { createWatcher } from "./watcher"
import { processFile } from "./services/fileProcessor"

const app = new Hono()

// Allow requests from the frontend application.
app.use("*", cors())

// Register all HTTP routes.
// app.route("/", routes)
app.route("/api/cme", cmeRoute)
import spv  from "./routes/simple-project-viewer.ts"
app.route("/simple-project-viewer", spv)
// WebSocket endpoint for pushing events to connected clients.
const { upgradeWebSocket, websocket } =
  createBunWebSocket<WebSocket>()

const clients = new Set<{ send(data: string): void }>()

function broadcast(event: string, data: unknown) {
  const payload = JSON.stringify({ event, data })

  for (const client of clients) {
    try {
      client.send(payload)
    } catch {}
  }
}

app.get(
  "/ws",
  upgradeWebSocket(() => ({
    onOpen(_event, ws) {
      clients.add(ws)
    },

    onClose(_event, ws) {
      clients.delete(ws)
    },
  })),
)

// Watch the downloads directory for newly downloaded files.
const stopWatching = createWatcher({
  dir: process.env.DOWNLOAD_DIR!,
  callback: async (path) => {
    const event = await processFile(path)

    if (event) {
      broadcast(event.event, event.data)
      console.log(Bun.inspect(event.data, { depth: Infinity, colors: true }))
    }
  },
})

// Start the HTTP and WebSocket server.
const server = Bun.serve({
  port: process.env.PORT || 3000,
  fetch: app.fetch,
  websocket,
})

// Gracefully shut down background services.
function shutdown() {
  stopWatching()
  server.stop()
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

console.log("Server listening on http://localhost:3000")