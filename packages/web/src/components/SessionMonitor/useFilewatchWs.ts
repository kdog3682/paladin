// src/components/SessionMonitor/useFilewatchWs.ts

import { useEffect } from "react"
import { useSessionMonitor } from "./store"
import type { SessionData } from "./types"

export function useFilewatchWs(url: string) {
  const setSession = useSessionMonitor((s) => s.setSession)
  const setConnected = useSessionMonitor((s) => s.setConnected)

  useEffect(() => {
    let ws: WebSocket | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let closed = false

    const connect = () => {
      ws = new WebSocket(url)

      ws.onopen = () => setConnected(true)
      ws.onclose = () => {
        setConnected(false)
        if (!closed) retryTimer = setTimeout(connect, 2000)
      }
      ws.onerror = () => ws?.close()

      ws.onmessage = (evt) => {
        try {
          const { event, data } = JSON.parse(evt.data)
          if (event === "session") setSession(data as SessionData)
        } catch {}
      }
    }

    connect()

    return () => {
      closed = true
      if (retryTimer) clearTimeout(retryTimer)
      ws?.close()
    }
  }, [url, setSession, setConnected])
}
