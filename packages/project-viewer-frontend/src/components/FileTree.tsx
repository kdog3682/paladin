// @paladin/project-viewer-frontend/src/components/FileTree.tsx
//
// Left panel — renders the full file tree as a flat indented list
// on a scrollable canvas. Everything is expanded by default.
// Active cursor row is highlighted. Bookmarked files get a dot.

import { useEffect, useRef } from "react"
import { useStore } from "../lib/store"
import type { FileNode } from "../types"
import { cn } from "../lib/cn"

/** Flatten the nested tree into indented rows for rendering. */
function flatten(
  nodes: FileNode[],
  depth: number,
  visiblePaths: Set<string>,
): FlatRow[] {
  const rows: FlatRow[] = []
  for (const node of nodes) {
    // dirs always show if they have visible descendants
    if (node.type === "dir") {
      const children = node.children
        ? flatten(node.children, depth + 1, visiblePaths)
        : []
      if (children.length > 0) {
        rows.push({ node, depth, kind: "dir" })
        rows.push(...children)
      }
    } else {
      if (visiblePaths.has(node.path)) {
        rows.push({ node, depth, kind: "file" })
      }
    }
  }
  return rows
}

type FlatRow = {
  node: FileNode
  depth: number
  kind: "file" | "dir"
}

export function FileTree() {
  const repo = useStore(s => s.repo)
  const visible = useStore(s => s.visible)
  const cursor = useStore(s => s.cursor)
  const bookmarks = useStore(s => s.bookmarks)
  const openFile = useStore(s => s.openFile)
  const ref = useRef<HTMLDivElement>(null)

  const visiblePaths = new Set(visible.map(f => f.path))
  const rows = repo ? flatten(repo.tree, 0, visiblePaths) : []

  // map visible file index to row index for scroll tracking
  const fileRows = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.kind === "file")

  const activeRowIndex = fileRows[cursor]?.i ?? -1

  // auto-scroll to keep cursor visible
  useEffect(() => {
    if (activeRowIndex < 0 || !ref.current) return
    const el = ref.current.children[activeRowIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: "nearest" })
  }, [activeRowIndex])

  /** Clicking a file sets it as active and opens it. */
  const onClick = (path: string) => {
    const idx = visible.findIndex(f => f.path === path)
    if (idx >= 0) {
      useStore.setState({ cursor: idx })
      openFile(path)
    }
  }

  return (
    <div ref={ref} className="py-2 font-mono text-xs">
      {rows.map((row, i) => {
        const isActive = i === activeRowIndex
        const isBookmarked = row.kind === "file" && bookmarks.has(row.node.path)

        return (
          <div
            key={row.node.path}
            className={cn(
              "flex items-center gap-1 px-2 py-px cursor-default select-none",
              isActive && "bg-accent text-accent-foreground",
              row.kind === "dir" && "text-muted-foreground font-medium",
            )}
            style={{ paddingLeft: `${row.depth * 16 + 8}px` }}
            onClick={() => row.kind === "file" && onClick(row.node.path)}
          >
            {row.kind === "dir" ? (
              <span className="text-muted-foreground">▸</span>
            ) : (
              <span className={cn("w-2", isBookmarked ? "text-primary" : "opacity-0")}>
                ●
              </span>
            )}
            <span className="truncate">{row.node.name}</span>
          </div>
        )
      })}
    </div>
  )
}
