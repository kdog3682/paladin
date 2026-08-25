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

// const featuresDir = join(import.meta.dir, 'features')
// for (const pkg of readdirSync(featuresDir)) {
//   const pkgDir = join(featuresDir, pkg)
//   const files = readdirSync(pkgDir).filter(f => f.endsWith('.handlers.ts'))
//   const allHandlers: Record<string, (kwargs: any) => unknown> = {}
//   for (const file of files) {
//     const mod = await import(join(pkgDir, file))
//     Object.assign(allHandlers, mod.handlers)
//   }
//   app.route(`/${pkg}`, createHandlerRouter(allHandlers))
// }


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

/*
instead of processFile 

call it services.scaffold.process(path)

no more of the featuresDir

instead do 

const services = registerServices(app, broadcast)

registerServices should read services/<name>/index.ts
if it exists. for all of them in services/
and try to get the class <name>Service
ie services/git/index.ts should have GitService.
if not, continue.

a cache called services = {}
and set services['git'] = new GitService(broadcast, ser)

and so forth for all the services.





async function mergeBranchThenCreateNewBranch(ctx, name) {
  const conflicts = await ctx.git.mergeBranch()

  if (conflicts) {
    ctx.broadcast('git.mergeBranch.conflicts', conflicts)
  } else {
    ctx.git.createBranch(name)
  }
}

async function getBranch(ctx) {
  return ctx.git.getBranch()
}
*/
