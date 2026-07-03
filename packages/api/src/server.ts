// @paladin/api/src/server.ts

import { Hono } from "hono"
import { cors } from "hono/cors"
import { createBunWebSocket } from "hono/bun"
import { createWatcher } from "./watcher"
import { processFile } from "./services/fileProcessor"

import { createHandlerRouter } from './createHandlerRouter'
import { readdirSync } from 'fs'
import { join } from 'path'




const app = new Hono()
app.use("*", cors())

const featuresDir = join(import.meta.dir, 'features')
for (const pkg of readdirSync(featuresDir)) {
  const pkgDir = join(featuresDir, pkg)
  const files = readdirSync(pkgDir).filter(f => f.endsWith('.handlers.ts'))
  const allHandlers: Record<string, (kwargs: any) => unknown> = {}
  for (const file of files) {
    const mod = await import(join(pkgDir, file))
    Object.assign(allHandlers, mod.handlers)
  }
  app.route(`/${pkg}`, createHandlerRouter(allHandlers))
}


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
      // console.log(Bun.inspect(event.data, { depth: Infinity, colors: true }))
      if (Array.isArray(event.data.codeExecutionResults)) {
  console.log("\n=== Code Execution Results ===")

  event.data.codeExecutionResults.forEach((result, i) => {
    console.log(`\n--- Result ${i + 1} ---`)
    console.log("Args:", result.args)
    console.log("Stdout:")
    console.log(result.stdout)
    console.log("Stderr:")
    console.log(result.stderr)
    console.log("Exit Code:", result.exitCode)
  })
}
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