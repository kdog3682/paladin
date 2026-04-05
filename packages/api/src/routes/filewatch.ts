// @paladin/packages/api/src/routes/filewatch.ts

import { Hono } from "hono"
import { createBunWebSocket } from "hono/bun"
import { bus } from "../bus"
import { startWatcher } from "../services/filewatch/watcher"

const { upgradeWebSocket, websocket } = createBunWebSocket()

const app = new Hono()

const EVENTS = [
  "filewatch:session",
  "filewatch:pending",
  "filewatch:results",
]

app.get(
  "/ws",
  upgradeWebSocket(() => {
    const listeners = new Map<string, (...args: unknown[]) => void>()

    return {
      onOpen(_evt, ws) {
        for (const event of EVENTS) {
          const listener = (data: unknown) => {
            ws.send(JSON.stringify({ event, data }))
          }
          listeners.set(event, listener)
          bus.on(event, listener)
        }
      },

      onMessage(evt, ws) {
        try {
          const msg = JSON.parse(String(evt.data))

          // handle re-run requests from frontend
          if (msg.event === "filewatch:rerun") {
            bus.emit("filewatch:rerun", msg.data)
          }
        } catch {
          // ignore malformed messages
        }
      },

      onClose() {
        for (const [event, listener] of listeners) {
          bus.off(event, listener)
        }
        listeners.clear()
      },
    }
  }),
)

startWatcher()

export { app as filewatchRoute, websocket }
