// @paladin/conversation-processor/routes.ts

import { Hono } from "hono"
import { createBunWebSocket } from "hono/bun"
import { bash } from "@paladin/utils/bash"
import type { BashResult } from "@paladin/utils/bash"
import type { ServerWebSocket } from "bun"
import type { ProjectData } from "./types"

const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>()

const clients = new Set<ServerWebSocket>()

export function broadcast(data: ProjectData) {
  const payload = JSON.stringify(data)
  for (const ws of clients) {
    ws.send(payload)
  }
}

const watched = new Set<string>()

const app = new Hono()

app.get(
  "/ws",
  upgradeWebSocket(() => ({
    onOpen(_event, ws) {
      clients.add(ws.raw as ServerWebSocket)
    },
    onClose(_event, ws) {
      clients.delete(ws.raw as ServerWebSocket)
    },
  })),
)

app.post("/watch", async (c) => {
  const { path, enabled } = await c.req.json()

  if (enabled) {
    watched.set(path, true)
  } else {
    watched.delete(path)
  }

  return c.json({ ok: true, watching: [...watched.keys()] })
})

app.get("/watch", (c) => {
  return c.json({ watching: [...watched] })
})

app.get("/health", (c) => c.json({ ok: true }))

export { app, websocket }
