// @paladin/json-viewer-frontend/src/App.tsx

import { useEffect } from "react"
import { useStore } from "./store"
import { JsonNode } from "./components/JsonViewer"
import { FzfPicker } from "./components/FzfPicker"
import { Badge } from "@bklearn/shadcn"
import { useNavStore, getInitialCursor } from "./hooks/useNavigation"

export function App() {
  const {
    selectedFile,
    jsonData,
    loading,
    openFzf,
    fetchFiles,
    toggleTheme,
    saveAsDefault,
    themeName,
    fzfOpen,
  } = useStore()
  const t = useStore((s) => s.theme)
  const { moveUp, moveDown, moveLeft, moveRight, toggleCollapse, setCursor } =
    useNavStore()

  // load most recent file on mount
  useEffect(() => {
    fetchFiles()
  }, [])

  // set initial cursor when data changes
  useEffect(() => {
    if (jsonData !== null && jsonData !== undefined) {
      setCursor(getInitialCursor(jsonData))
    }
  }, [jsonData])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // don't capture when fzf is open
      if (fzfOpen) {
        if (e.key === "Escape") {
          e.preventDefault()
          useStore.getState().closeFzf()
        }
        return
      }

      // ⌘O — open fzf picker (fetches fresh list)
      if (e.key === "o" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        openFzf()
        return
      }

      // ⌘S — save current file as default
      if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        saveAsDefault()
        return
      }

      // ⌘⇧T — toggle theme
      if (e.key === "t" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault()
        toggleTheme()
        return
      }

      if (!jsonData) return

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault()
          moveUp(jsonData)
          break
        case "ArrowDown":
          e.preventDefault()
          moveDown(jsonData)
          break
        case "ArrowLeft":
          e.preventDefault()
          moveLeft()
          break
        case "ArrowRight":
          e.preventDefault()
          moveRight(jsonData)
          break
        case " ":
          e.preventDefault()
          toggleCollapse(jsonData)
          break
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [fzfOpen, jsonData, moveUp, moveDown, moveLeft, moveRight, toggleCollapse, openFzf, toggleTheme])

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} font-mono text-sm`}>
      <header
        className={`sticky top-0 z-10 flex items-center justify-between border-b ${t.headerBorder} ${t.headerBg} px-4 py-2 backdrop-blur`}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold">json-viewer</h1>
          {selectedFile && (
            <Badge variant="secondary" className="font-mono text-xs">
              {selectedFile.name}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className={`rounded border ${t.headerBorder} px-2 py-1 text-xs ${t.toggle} ${t.toggleHover} transition-colors cursor-pointer`}
          >
            {themeName === "light" ? "☀️" : "🌙"}
          </button>
          <button
            onClick={() => openFzf()}
            className={`rounded border ${t.headerBorder} px-2.5 py-1 text-xs ${t.toggle} ${t.toggleHover} transition-colors cursor-pointer`}
          >
            <kbd className={`mr-1 ${t.comma}`}>⌘O</kbd> Open file
          </button>
        </div>
      </header>

      <main className="p-4" tabIndex={0}>
        {loading && (
          <div className={`${t.null} animate-pulse`}>Loading…</div>
        )}

        {!loading && !jsonData && (
          <div className={`flex flex-col items-center justify-center py-20 ${t.null}`}>
            <p>No file selected</p>
            <p className="mt-1 text-xs">
              Press <kbd className={`rounded ${t.blockBg} px-1.5 py-0.5`}>⌘O</kbd>{" "}
              to pick a JSON file
            </p>
          </div>
        )}

        {!loading && jsonData && <JsonNode data={jsonData} path={[]} />}
      </main>

      <FzfPicker />
    </div>
  )
}
