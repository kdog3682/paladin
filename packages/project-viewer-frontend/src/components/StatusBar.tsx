// @paladin/project-viewer-frontend/src/components/StatusBar.tsx
//
// Bottom bar showing repo name, file counts, session name,
// and bookmark count. Also shows keyboard shortcut hints.

import { useStore } from "../lib/store"

export function StatusBar() {
  const repo = useStore(s => s.repo)
  const visible = useStore(s => s.visible)
  const cursor = useStore(s => s.cursor)
  const bookmarks = useStore(s => s.bookmarks)
  const session = useStore(s => s.session)
  const greps = useStore(s => s.greps)

  if (!repo) return null

  const current = visible[cursor]

  return (
    <div className="shrink-0 flex items-center justify-between px-4 py-1.5 border-t border-border bg-muted text-xs text-muted-foreground font-mono">
      <div className="flex items-center gap-4">
        <span>{repo.org}/{repo.name}</span>
        <span>{visible.length} files</span>
        {greps.length > 0 && <span>{greps.length} greps</span>}
        {bookmarks.size > 0 && <span>{bookmarks.size} bookmarked</span>}
        {session && <span>⬥ {session.name}</span>}
      </div>
      <div className="flex items-center gap-3">
        {current && (
          <span className="max-w-xs truncate">{current.path}</span>
        )}
        <span>↑↓ nav</span>
        <span>s mark</span>
        <span>/ grep</span>
        <span>⌘K cmd</span>
      </div>
    </div>
  )
}
