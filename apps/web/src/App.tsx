// @paladin/web/src/App.tsx

import { useEffect } from "react"
import { useStore } from "@/stores/app"
import { StatusBar } from "@/components/StatusBar"
import { StagingView } from "@/views/StagingView"
import { LogView } from "@/views/LogView"
import { PlaceholderView } from "@/views/PlaceholderView"
import { useView } from "@/hooks/useView"

export function App() {
  const connect = useStore((s) => s.connect)
  const disconnect = useStore((s) => s.disconnect)
  const view = useStore((s) => s.view)

  useView()

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      {view === 1 && <StagingView />}
      {view === 2 && <PlaceholderView name="Tickets" />}
      {view === 3 && <PlaceholderView name="Editor" />}
      {view === 4 && <PlaceholderView name="Command" />}
      {view === 5 && <LogView />}
      {view >= 6 && <PlaceholderView name={`View ${view}`} />}
      <StatusBar />
    </div>
  )
}
