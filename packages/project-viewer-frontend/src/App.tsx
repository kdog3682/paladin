// @paladin/project-viewer-frontend/src/App.tsx
//
// Root shell. Three states: idle (input), loading, ready (split panels).
// Mounts global keybindings once via useKeys.

import { useStore } from "./lib/store"
import { useKeys } from "./lib/keys"
import { Landing } from "./components/Landing"
import { FileTree } from "./components/FileTree"
import { RightPanel } from "./components/RightPanel"
import { GrepModal } from "./components/GrepModal"
import { CmdkPalette } from "./components/CmdkPalette"
import { StatusBar } from "./components/StatusBar"

export function App() {
  useKeys()

  const status = useStore(s => s.status)
  const grepOpen = useStore(s => s.grepOpen)
  const cmdkOpen = useStore(s => s.cmdkOpen)

  if (status === "idle" || status === "loading") {
    return <Landing />
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <div className="flex flex-1 min-h-0">
        {/* left panel — canvas file tree, always visible */}
        <div className="w-80 shrink-0 border-r border-border overflow-auto">
          <FileTree />
        </div>

        {/* right panel — viewer / config / notepad, toggled by Tab */}
        <div className="flex-1 min-w-0 overflow-auto">
          <RightPanel />
        </div>
      </div>

      <StatusBar />

      {/* modals */}
      {grepOpen && <GrepModal />}
      {cmdkOpen && <CmdkPalette />}
    </div>
  )
}
