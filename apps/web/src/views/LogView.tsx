// @paladin/web/src/views/LogView.tsx

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useLogStore, type LogEntry } from "@/stores/log"
import { useStore } from "@/stores/app"
import { Terminal, GitBranch, Trash2, Info, CheckCircle, AlertTriangle, XCircle } from "lucide-react"

type Tab = "app" | "git"

const kindIcon = (kind: LogEntry["kind"]) => {
  switch (kind) {
    case "info": return <Info className="w-3.5 h-3.5 text-blue-400" />
    case "success": return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
    case "warn": return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
    case "error": return <XCircle className="w-3.5 h-3.5 text-rose-400" />
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

export function LogView() {
  const [tab, setTab] = useState<Tab>("app")
  const entries = useLogStore((s) => s.entries)
  const clearLog = useLogStore((s) => s.clear)
  const [gitLog, setGitLog] = useState<string[]>([])
  const send = useStore((s) => s.send)

  useEffect(() => {
    if (tab === "git") {
      // Fetch git log via a simple approach — could be wired through ws
      // For now show placeholder
    }
  }, [tab])

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab("app")}
            className={`
              flex items-center gap-1.5 px-2 py-1 rounded text-sm transition-colors
              ${tab === "app" ? "bg-primary/20 text-primary font-semibold" : "text-muted-foreground hover:text-foreground"}
            `}
          >
            <Terminal className="w-3.5 h-3.5" />
            App Log
          </button>
          <button
            onClick={() => setTab("git")}
            className={`
              flex items-center gap-1.5 px-2 py-1 rounded text-sm transition-colors
              ${tab === "git" ? "bg-primary/20 text-primary font-semibold" : "text-muted-foreground hover:text-foreground"}
            `}
          >
            <GitBranch className="w-3.5 h-3.5" />
            Git Log
          </button>
        </div>

        {tab === "app" && (
          <Button variant="ghost" size="sm" onClick={clearLog} className="gap-1.5 text-muted-foreground">
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        {tab === "app" && (
          <div className="p-2 space-y-0.5">
            {entries.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Terminal className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>No log entries yet</p>
              </div>
            ) : (
              entries.map((entry) => (
                <div key={entry.id} className="flex items-start gap-2 px-3 py-1.5 rounded hover:bg-accent/30">
                  {kindIcon(entry.kind)}
                  <span className="text-xs text-muted-foreground font-mono shrink-0">
                    {formatTime(entry.timestamp)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-foreground">{entry.message}</span>
                    {entry.detail && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.detail}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "git" && (
          <div className="p-2">
            <div className="text-center py-12 text-muted-foreground">
              <GitBranch className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>Git log coming soon</p>
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
