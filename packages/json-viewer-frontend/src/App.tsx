// @paladin/json-viewer-frontend/src/App.tsx

import { useEffect } from "react"
import { useStore } from "./store"
import { JsonNode } from "./components/JsonViewer"
import { FzfPicker } from "./components/FzfPicker"
import { Badge } from "@bklearn/shadcn"

export function App() {
  const {
    fetchFiles,
    selectedFile,
    jsonData,
    loading,
    toggleFzf,
    toggleTheme,
    themeName,
  } = useStore()
  const t = useStore((s) => s.theme)

  useEffect(() => {
    fetchFiles()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // ⌘P / Ctrl+P — toggle fzf picker
      if (e.key === "p" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        toggleFzf()
      }
      // ⌘T / Ctrl+T — toggle theme
      if (e.key === "t" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault()
        toggleTheme()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [toggleFzf, toggleTheme])

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
            onClick={toggleFzf}
            className={`rounded border ${t.headerBorder} px-2.5 py-1 text-xs ${t.toggle} ${t.toggleHover} transition-colors cursor-pointer`}
          >
            <kbd className={`mr-1 ${t.comma}`}>⌘P</kbd> Open file
          </button>
        </div>
      </header>

      <main className="p-4">
        {loading && (
          <div className={`${t.null} animate-pulse`}>Loading…</div>
        )}

        {!loading && !jsonData && (
          <div className={`flex flex-col items-center justify-center py-20 ${t.null}`}>
            <p>No file selected</p>
            <p className="mt-1 text-xs">
              Press <kbd className={`rounded ${t.blockBg} px-1.5 py-0.5`}>⌘P</kbd>{" "}
              to pick a JSON file
            </p>
          </div>
        )}

        {!loading && jsonData && <JsonNode data={jsonData} />}
      </main>

      <FzfPicker />
    </div>
  )
}
