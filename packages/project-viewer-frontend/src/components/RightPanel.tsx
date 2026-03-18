// @paladin/project-viewer-frontend/src/components/RightPanel.tsx
//
// Switches between the three tabs: viewer, config, notepad.
// Tab indicator shown at the top.

import { useStore } from "../lib/store"
import { Viewer } from "./Viewer"
import { FilterConfig } from "./FilterConfig"
import { Notepad } from "./Notepad"
import { cn } from "../lib/cn"
import type { Tab } from "../types"

const TABS: { key: Tab, label: string }[] = [
  { key: "viewer", label: "Viewer" },
  { key: "config", label: "Filters" },
  { key: "notepad", label: "Notepad" },
]

export function RightPanel() {
  const tab = useStore(s => s.tab)
  const setTab = useStore(s => s.setTab)

  return (
    <div className="flex flex-col h-full">
      {/* tab bar */}
      <div className="flex border-b border-border shrink-0">
        {TABS.map(t => (
          <button
            key={t.key}
            className={cn(
              "px-4 py-2 text-xs font-medium transition-colors",
              t.key === tab
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto px-3 py-2 text-xs text-muted-foreground">
          Tab to cycle
        </span>
      </div>

      {/* content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {tab === "viewer" && <Viewer />}
        {tab === "config" && <FilterConfig />}
        {tab === "notepad" && <Notepad />}
      </div>
    </div>
  )
}
