// src/routes/filewatch.ts

import { Hono } from "hono"
import { createBunWebSocket } from "hono/bun"
import { watch } from "node:fs"
import { join } from "node:path"
import type { ServerWebSocket } from "bun"
import { readFileSafe, waitForStable } from "../utils/fs"
import { run } from "../processors/claude/run"
import { bus } from "../bus"
import type { Conversation } from "../types/claude"
import type { SessionData } from "../types/session"

const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>()

const clients = new Set<{ send: (data: string) => void }>()

function broadcast(event: string, data: unknown) {
  const payload = JSON.stringify({ event, data })
  for (const client of clients) {
    try { client.send(payload) } catch {}
  }
}

bus.on("filewatch:session", (session: SessionData) => {
  broadcast("session", session)
})

// ── Watcher ──────────────────────────────────────────────

let watcherStarted = false

function startWatcher() {
  if (watcherStarted) return
  const dir = process.env.SCRATCH_DIR
  if (!dir) {
    console.error("SCRATCH_DIR not set — filewatch disabled")
    return
  }

  watcherStarted = true
  console.log(`filewatch: watching ${dir}`)

  watch(dir, async (event, filename) => {
    if (event !== "rename" || !filename) return
    if (filename.startsWith(".") || filename.endsWith(".crdownload")) return
    if (!filename.endsWith(".json")) return

    const filepath = join(dir, filename)
    await waitForStable(filepath)

    try {
      const conversation = (await readFileSafe(filepath)) as Conversation | null
      if (!conversation) return
      await run(conversation)
    } catch (e) {
      console.error("filewatch error:", e)
    }
  })
}

startWatcher()

// ── Route ────────────────────────────────────────────────

const app = new Hono()

app.get(
  "/ws",
  upgradeWebSocket(() => ({
    onOpen(_evt, ws) {
      clients.add(ws)
    },
    onClose(_evt, ws) {
      clients.delete(ws)
    },
  })),
)

export { websocket }
export default app
