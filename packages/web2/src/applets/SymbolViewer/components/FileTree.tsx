import { useEffect, useMemo, useRef } from "react"
import { SidebarGroup, SidebarGroupContent, SidebarMenu, Skeleton } from "@paladin/shadcn"
import { useFsMutations, useTree, type FsNode } from "../api"
import { useWorkspace } from "../store"
import { basename } from "../lib/paths"
import { collectPaths, flattenVisible } from "../lib/tree"
import { resolveRename } from "../lib/rename"
import { useRestoreFocus, useScrollMemory } from "../lib/restore"
import { dialog } from "./Dialogs"
import { toast } from "./Toasts"
import { FsEntry } from "./FsEntry"

export function FileTree() {
  const root = useWorkspace((s) => s.root)
  const expanded = useWorkspace((s) => s.expanded)
  const currentFile = useWorkspace((s) => s.currentFile)
  const cursor = useWorkspace((s) => s.cursor)
  const { openFile, toggleExpanded, setExpanded, setCursor, setFocus } = useWorkspace.getState()
  const tree = useTree(root)
  const { renamePath, deletePath } = useFsMutations()

  const listRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => flattenVisible(tree.data?.children ?? [], expanded), [tree.data, expanded])
  const paths = useMemo(() => collectPaths(tree.data), [tree.data])

  /* the sidebar content element is what scrolls */
  const scroller = () => listRef.current?.closest<HTMLElement>('[data-sidebar="content"]')
  useScrollMemory({ getEl: scroller, bucket: "treeScroll", key: root, ready: !!tree.data })
  useRestoreFocus("tree", !!tree.data, () => listRef.current)

  /* keep the cursor row visible, ie after cmd+p or arrow keys */
  useEffect(() => {
    if (!cursor) return
    const el = listRef.current?.querySelector(`[data-path="${CSS.escape(cursor)}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [cursor])

  const activate = (node: FsNode) => {
    setCursor(node.path)
    if (node.kind === "dir") toggleExpanded(node.path)
    else openFile(node.path)
  }

  const rename = async (node: FsNode) => {
    if (!root) return
    const input = await dialog.prompt({
      title: `Rename ${node.kind === "dir" ? "folder" : "file"}`,
      description: "relative paths work, ie ../expr or ../expr/ to move into a folder",
      initial: basename(node.path),
      selectStem: node.kind === "file",
    })
    if (input === null) return
    const res = resolveRename({ from: node.path, input, kind: node.kind, root, exists: (p) => paths.has(p) })
    if (!res.ok) return toast.warn(res.reason)
    renamePath.mutate({ from: node.path, to: res.to })
  }

  const remove = async (node: FsNode) => {
    const ok = await dialog.confirm({
      title: `Delete ${node.name}?`,
      description: node.kind === "dir" ? "The folder and everything inside it will be deleted." : undefined,
      action: "Delete",
    })
    if (ok) deletePath.mutate({ path: node.path })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const idx = rows.findIndex((r) => r.node.path === cursor)
    const row = rows[idx]
    const move = (i: number) => {
      const next = rows[Math.max(0, Math.min(rows.length - 1, i))]
      if (next) setCursor(next.node.path)
    }

    switch (e.key) {
      case "ArrowDown":
        move(idx + 1)
        break
      case "ArrowUp":
        move(idx < 0 ? 0 : idx - 1)
        break
      case "Home":
        move(0)
        break
      case "End":
        move(rows.length - 1)
        break
      case "ArrowRight":
        if (!row) return move(0)
        if (row.node.kind === "file") openFile(row.node.path)
        else if (!expanded[row.node.path]) setExpanded(row.node.path, true)
        else if (rows[idx + 1]?.parent === row.node.path) move(idx + 1)
        break
      case "ArrowLeft":
        if (!row) return
        if (row.node.kind === "dir" && expanded[row.node.path]) setExpanded(row.node.path, false)
        else if (row.parent) setCursor(row.parent)
        break
      case "Enter":
      case " ":
        if (row) activate(row.node)
        break
      case "F2":
        if (row) rename(row.node)
        break
      case "Delete":
        if (row) remove(row.node)
        break
      default:
        return
    }
    e.preventDefault()
  }

  if (!root) return <p className="px-4 py-2 text-xs text-muted-foreground">No package loaded. ⌘L to pick one.</p>

  return (
    <SidebarGroup className="py-1">
      <SidebarGroupContent>
        <div
          ref={listRef}
          tabIndex={0}
          role="tree"
          aria-label="Files"
          onKeyDown={onKeyDown}
          onFocus={() => {
            setFocus("tree")
            if (!cursor && rows[0]) setCursor(rows[0].node.path)
          }}
          className="rounded-md outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring"
        >
          {tree.isLoading ? (
            <div className="space-y-1.5 p-2">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-4" style={{ width: `${50 + ((i * 37) % 45)}%` }} />
              ))}
            </div>
          ) : (
            <SidebarMenu className="gap-0">
              {rows.map((r) => (
                <FsEntry
                  key={r.node.path}
                  node={r.node}
                  depth={r.depth}
                  expanded={!!expanded[r.node.path]}
                  active={r.node.path === currentFile}
                  cursor={r.node.path === cursor}
                  onActivate={() => {
                    listRef.current?.focus()
                    activate(r.node)
                  }}
                  onRename={() => rename(r.node)}
                  onDelete={() => remove(r.node)}
                />
              ))}
            </SidebarMenu>
          )}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
