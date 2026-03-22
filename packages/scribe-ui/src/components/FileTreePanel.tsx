// @paladin/scribe-ui/src/components/FileTreePanel.tsx

import { useStore } from "../store"
import { useKeyBindings } from "../keybindings"
import type { TreeNode } from "../types"
import { Button } from "@bklearn/shadcn"
import { Badge } from "@bklearn/shadcn"
import {
  Bookmark,
  BookmarkCheck,
  Trash2,
  Folder,
  FileCode,
  Search,
  Save,
  Pin,
} from "lucide-react"

function TreeItem({
  node,
  depth = 0,
  selected,
  onSelect,
  onToggleBookmark,
  onRemove,
  onPin,
}: {
  node: TreeNode
  depth?: number
  selected: boolean
  onSelect: (path: string) => void
  onToggleBookmark: (path: string) => void
  onRemove: (path: string) => void
  onPin: (path: string) => void
}) {
  const Icon = node.type === "directory" ? Folder : FileCode
  const BookmarkIcon = node.bookmarked ? BookmarkCheck : Bookmark

  return (
    <>
      <div
        className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer text-sm hover:bg-accent rounded-sm group ${
          selected ? "bg-accent" : ""
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node.path)}
      >
        <Icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        <span className="truncate flex-1">{node.name}</span>
        {node.label && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
            {node.label}
          </Badge>
        )}
        <button
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-primary"
          onClick={(e) => {
            e.stopPropagation()
            onPin(node.path)
          }}
        >
          <Pin className="h-3 w-3" />
        </button>
        <button
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-primary"
          onClick={(e) => {
            e.stopPropagation()
            onToggleBookmark(node.path)
          }}
        >
          <BookmarkIcon className="h-3 w-3" />
        </button>
        <button
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(node.path)
          }}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {node.children.map((child) => (
        <TreeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          selected={selected}
          onSelect={onSelect}
          onToggleBookmark={onToggleBookmark}
          onRemove={onRemove}
          onPin={onPin}
        />
      ))}
    </>
  )
}

export function FileTreePanel() {
  const {
    treeNodes,
    selectedTreePath,
    setSelectedTreePath,
    toggleBookmark,
    removeFromTree,
    togglePin,
    setPickerOpen,
    setFileGroupSaveOpen,
    setRightPanelTab,
    readFile,
    setViewerFileIndex,
    sourceFiles,
  } = useStore()

  // Tree-specific keybindings
  useKeyBindings(
    "filetree",
    [
      {
        key: "p",
        description: "Pin selected file",
        handler: () => {
          if (selectedTreePath) togglePin(selectedTreePath)
        },
      },
      {
        key: "b",
        description: "Bookmark selected file",
        handler: () => {
          if (selectedTreePath) toggleBookmark(selectedTreePath)
        },
      },
      {
        key: "Enter",
        description: "View selected file",
        handler: () => {
          if (selectedTreePath) {
            const idx = sourceFiles.indexOf(selectedTreePath)
            if (idx >= 0) {
              setViewerFileIndex(idx)
              setRightPanelTab("viewer")
            } else {
              // Read and view even if not bookmarked
              readFile(selectedTreePath)
              setRightPanelTab("viewer")
            }
          }
        },
      },
      {
        key: "ArrowDown",
        description: "Next item",
        handler: () => {
          const allPaths = flattenPaths(treeNodes)
          const idx = allPaths.indexOf(selectedTreePath ?? "")
          const next = allPaths[Math.min(idx + 1, allPaths.length - 1)]
          if (next) setSelectedTreePath(next)
        },
      },
      {
        key: "ArrowUp",
        description: "Previous item",
        handler: () => {
          const allPaths = flattenPaths(treeNodes)
          const idx = allPaths.indexOf(selectedTreePath ?? "")
          const prev = allPaths[Math.max(idx - 1, 0)]
          if (prev) setSelectedTreePath(prev)
        },
      },
    ],
    [selectedTreePath, treeNodes, sourceFiles]
  )

  if (treeNodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Search className="h-8 w-8" />
        <p className="text-sm">No files yet</p>
        <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
          pick files (j)
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Files
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setFileGroupSaveOpen(true)}
          >
            <Save className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setPickerOpen(true)}
          >
            <Search className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {treeNodes.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            selected={selectedTreePath === node.path}
            onSelect={setSelectedTreePath}
            onToggleBookmark={toggleBookmark}
            onRemove={removeFromTree}
            onPin={togglePin}
          />
        ))}
      </div>
    </div>
  )
}

function flattenPaths(nodes: TreeNode[]): string[] {
  const result: string[] = []
  for (const n of nodes) {
    result.push(n.path)
    result.push(...flattenPaths(n.children))
  }
  return result
}
