// src/components/SessionMonitor/SessionMonitor.tsx

import { useSessionMonitor } from "./store"
import { useFilewatchWs } from "./useFilewatchWs"
import { Sidebar } from "./Sidebar"
import { Results } from "./Results"

interface SessionMonitorProps {
  wsUrl?: string
}

export function SessionMonitor() {
  const wsUrl = "ws://localhost:3001/filewatch/ws"
  useFilewatchWs(wsUrl)
  const session = useSessionMonitor((s) => s.session)
  const connected = useSessionMonitor((s) => s.connected)
  console.log(session)
  return (
    <div className="flex h-full w-full">
      <Sidebar session={session} connected={connected} />
      <Results results={session?.runResults ?? []} />
    </div>
  )
}
