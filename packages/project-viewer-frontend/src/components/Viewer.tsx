// @paladin/project-viewer-frontend/src/components/Viewer.tsx
//
// Displays the content of the currently selected file.
// Auto-fetches when cursor changes.

import { useEffect } from "react"
import { useStore } from "../lib/store"

export function Viewer() {
  const content = useStore(s => s.content)
  const contentPath = useStore(s => s.contentPath)
  const cursor = useStore(s => s.cursor)
  const visible = useStore(s => s.visible)
  const openCurrent = useStore(s => s.openCurrent)

  // fetch content whenever cursor moves
  useEffect(() => {
    if (visible.length > 0) openCurrent()
  }, [cursor, visible.length])

  if (!contentPath) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No file selected
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-4 py-2 border-b border-border text-xs text-muted-foreground font-mono">
        {contentPath}
      </div>
      <pre className="flex-1 overflow-auto p-4 text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
        {content}
      </pre>
    </div>
  )
}
