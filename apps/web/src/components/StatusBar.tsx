// @paladin/web/src/components/StatusBar.tsx

import { useStore } from "@/stores/app"
import type { ViewId } from "@/hooks/useView"
import { ProjectSelector } from "@/components/ProjectSelector"
import { SettingsModal } from "@/components/SettingsModal"
import { Wifi, WifiOff } from "lucide-react"

interface ViewConfig {
  id: ViewId
  name: string
  key: string
}

const views: ViewConfig[] = [
  { id: 1, name: "Staging", key: "1" },
  { id: 2, name: "Tickets", key: "2" },
  { id: 3, name: "Editor", key: "3" },
  { id: 4, name: "Command", key: "4" },
  { id: 5, name: "Log", key: "5" },
]

export function StatusBar() {
  const currentView = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const isConnected = useStore((s) => s.isConnected)

  return (
    <div className="h-8 flex items-center justify-between px-2 bg-muted/50 border-t border-border text-xs">
      <div className="flex items-center gap-1">
        <ProjectSelector />

        <div className="w-px h-4 bg-border mx-2" />

        {views.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`
              flex items-center gap-1.5 px-2 py-1 rounded transition-colors
              ${currentView === v.id
                ? "bg-primary/20 text-primary font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }
            `}
          >
            <kbd className={`
              px-1 py-0.5 rounded text-[10px] font-mono border
              ${currentView === v.id
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-background border-border"
              }
            `}>
              {v.key}
            </kbd>
            <span>{v.name}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <SettingsModal />

        <div className="flex items-center gap-1.5">
          {isConnected ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-500">Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-destructive" />
              <span className="text-destructive">Disconnected</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
