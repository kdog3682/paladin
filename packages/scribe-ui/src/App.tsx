// @paladin/scribe-ui/src/App.tsx

import { useEffect, useRef } from "react"
import { useStore } from "./store"
import { KeyBindingProvider, useKeyBindings } from "./keybindings"
import { Editor } from "./components/Editor"
import { FileTreePanel } from "./components/FileTreePanel"
import { FileViewer } from "./components/FileViewer"
import { FuzzyPicker } from "./components/FuzzyPicker"
import { TemplateManager } from "./components/TemplateManager"
import { PreviewModal } from "./components/PreviewModal"
import { TicketPicker } from "./components/TicketPicker"
import { FileGroupSaveModal } from "./components/FileGroupSaveModal"
import { KeybindingHelp } from "./components/KeybindingHelp"
import { Tabs, TabsList, TabsTrigger } from "@bklearn/shadcn"
import { Toaster } from "sonner"

function ScribeApp() {
  const {
    init,
    rightPanelTab,
    viewerFullscreen,
    isDirty,
    saveTicket,
    toggleRightPanel,
    setPickerOpen,
    setTicketPickerOpen,
    setKeybindingHelpOpen,
    setViewerFullscreen,
    pickerOpen,
    templateManagerOpen,
    previewOpen,
    ticketPickerOpen,
    fileGroupSaveOpen,
    keybindingHelpOpen,
    loadRecentFiles,
  } = useStore()

  const editorRef = useRef<HTMLTextAreaElement>(null)
  const autoSaveRef = useRef<ReturnType<typeof setInterval>>()

  // Init on mount
  useEffect(() => {
    init()
  }, [])

  // Auto-save every 5 minutes when dirty
  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      if (useStore.getState().isDirty) {
        saveTicket()
      }
    }, 5 * 60 * 1000)
    return () => clearInterval(autoSaveRef.current)
  }, [])

  // Poll recent files every 30s
  useEffect(() => {
    const interval = setInterval(loadRecentFiles, 30_000)
    return () => clearInterval(interval)
  }, [])

  // Save on tab departure
  useEffect(() => {
    const handler = () => {
      if (useStore.getState().isDirty) {
        saveTicket()
      }
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [])

  // Register scribe keybindings
  useKeyBindings(
    "scribe",
    [
      {
        key: "s",
        meta: true,
        description: "Save ticket",
        handler: (e) => {
          e.preventDefault()
          useStore.getState().saveTicket()
        },
      },
      {
        key: "o",
        meta: true,
        description: "Open ticket",
        handler: (e) => {
          e.preventDefault()
          useStore.getState().setTicketPickerOpen(true)
        },
      },
      {
        key: "/",
        meta: true,
        description: "Keybinding help",
        handler: () => setKeybindingHelpOpen(true),
      },
      {
        key: "Tab",
        description: "Toggle right panel",
        handler: () => {
          if (viewerFullscreen) {
            setViewerFullscreen(false)
          } else {
            toggleRightPanel()
          }
        },
      },
      {
        key: "j",
        description: "Open fuzzy picker",
        handler: () => setPickerOpen(true),
      },
      {
        key: "i",
        description: "Focus editor",
        handler: () => editorRef.current?.focus(),
      },
      {
        key: "Escape",
        description: "Unfocus / close",
        handler: () => {
          if (viewerFullscreen) {
            setViewerFullscreen(false)
            return
          }
          const active = document.activeElement as HTMLElement
          active?.blur()
        },
      },
    ],
    [viewerFullscreen]
  )

  const showLeftPanel = !viewerFullscreen

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Applet tabs */}
      <div className="flex items-center border-b px-4 py-1.5 gap-4">
        <Tabs defaultValue="scribe">
          <TabsList>
            <TabsTrigger value="session" disabled>
              1 Session
            </TabsTrigger>
            <TabsTrigger value="scribe">2 Scribe</TabsTrigger>
            <TabsTrigger value="config" disabled>
              3 Config
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {isDirty && (
          <div className="h-2 w-2 rounded-full bg-orange-400 animate-pulse" title="Unsaved changes" />
        )}
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {showLeftPanel && (
          <div className="flex-1 min-w-0 border-r">
            <Editor ref={editorRef} />
          </div>
        )}
        <div className={viewerFullscreen ? "flex-1" : "w-[480px] flex-shrink-0"}>
          {rightPanelTab === "tree" && !viewerFullscreen ? (
            <FileTreePanel />
          ) : (
            <FileViewer fullscreen={viewerFullscreen} />
          )}
        </div>
      </div>

      {/* Modals */}
      {pickerOpen && <FuzzyPicker />}
      {templateManagerOpen && <TemplateManager />}
      {previewOpen && <PreviewModal />}
      {ticketPickerOpen && <TicketPicker />}
      {fileGroupSaveOpen && <FileGroupSaveModal />}
      {keybindingHelpOpen && <KeybindingHelp />}
    </div>
  )
}

export default function App() {
  return (
    <KeyBindingProvider>
      <ScribeApp />
      <Toaster position="bottom-right" />
    </KeyBindingProvider>
  )
}
