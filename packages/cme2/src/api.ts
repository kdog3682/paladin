const BASE = '/api'

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`)
  return res.json() as Promise<T>
}

type WsHandler = (msg: unknown) => void

function makeSocket(url: string) {
  let ws: WebSocket | null = null
  const handlers = new Set<WsHandler>()

  const connect = () => {
    ws = new WebSocket(url)
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data)
      handlers.forEach((h) => h(data))
    }
    ws.onclose = () => setTimeout(connect, 1000) // reconnect
  }
  connect()

  return {
    on: (h: WsHandler) => {
      handlers.add(h)
      return () => handlers.delete(h)
    },
    send: (msg: unknown) => ws?.send(JSON.stringify(msg)),
  }
}

export const api = {
  get: <T>(p: string) => req<T>('GET', p),
  post: <T>(p: string, body?: unknown) => req<T>('POST', p, body),
  put: <T>(p: string, body?: unknown) => req<T>('PUT', p, body),
  run: <T>(cmd: string, ...args: unknown[]) => req<T>('POST', '/run', { cmd, args }),
  socket: makeSocket(`ws://${location.host}/api/ws`),
}

export type Api = typeof api
