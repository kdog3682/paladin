// @paladin/api/src/server.ts

import type { ServerMessage, ClientMessage } from "@paladin/types"

type MessageHandler = (data: Record<string, unknown>) => void | Promise<void>

export class WebSocketServer {
  private clients = new Set<WebSocket>()
  private messageHandlers = new Map<string, MessageHandler[]>()

  constructor(private port = 3000) {}

  onMessage(type: ClientMessage["type"], handler: MessageHandler): this {
    const list = this.messageHandlers.get(type) ?? []
    list.push(handler)
    this.messageHandlers.set(type, list)
    return this
  }

  broadcast(message: ServerMessage): void {
    const msg = JSON.stringify(message)
    for (const client of this.clients) client.send(msg)
  }

  start(): void {
    Bun.serve({
      port: this.port,
      fetch: (req, server) => {
        const url = new URL(req.url)
        if (url.pathname === "/ws" && server.upgrade(req)) return
        return new Response("Not found", { status: 404 })
      },
      websocket: {
        open: (ws) => {
          this.clients.add(ws)
        },
        close: (ws) => {
          this.clients.delete(ws)
        },
        message: async (_, message) => {
          const data = JSON.parse(message as string)
          const handlers = this.messageHandlers.get(data.type)
          if (!handlers) return
          for (const handler of handlers) {
            await handler(data)
          }
        },
      },
    })
    console.log(`WebSocket server running on ws://localhost:${this.port}/ws`)
  }
}
