import { ChevronRight, FileCode2, Folder, FolderOpen } from "lucide-react"
import {
  cn,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@paladin/shadcn"
import type { FsNode } from "../api"
import { InlineRename } from "./InlineRename"

export type FsEntryProps = {
  node: FsNode
  depth: number
  expanded: boolean
  /* this is the open file */
  active: boolean
  /* the keyboard cursor sits on this row */
  cursor: boolean
  onActivate: () => void
  /* starts an inline rename */
  onRename: () => void
  /* the name is being edited in place */
  renaming: boolean
  /* return false to keep editing */
  onRenameSubmit: (input: string) => boolean | void
  onRenameCancel: () => void
  onDelete: () => void
}

export function FsEntry(props: FsEntryProps) {
  const { node, depth, expanded, active, cursor, onActivate, onRename, renaming, onDelete } = props
  const isDir = node.kind === "dir"
  const Icon = isDir ? (expanded ? FolderOpen : Folder) : FileCode2
  const indent = { paddingLeft: 8 + depth * 12 }

  const icons = (
    <>
      <ChevronRight
        className={cn("size-3 shrink-0 transition-transform", !isDir && "invisible", expanded && "rotate-90")}
      />
      <Icon className="size-3.5 shrink-0 opacity-70" />
    </>
  )

  /* an input can't live inside the row's <button>, so the row becomes a plain div while editing */
  if (renaming)
    return (
      <SidebarMenuItem data-path={node.path}>
        <div style={indent} className="flex items-center gap-2 py-0.5 pr-2">
          {icons}
          <InlineRename
            initial={node.name}
            selectStem={!isDir}
            onSubmit={props.onRenameSubmit}
            onCancel={props.onRenameCancel}
          />
        </div>
        <p style={{ paddingLeft: indent.paddingLeft + 34 }} className="pb-1 text-[10px] text-muted-foreground">
          ../expr works · end with / to move into a folder
        </p>
      </SidebarMenuItem>
    )

  return (
    <SidebarMenuItem data-path={node.path}>
      <ContextMenu>
        {/* base ui: the trigger renders its own wrapper div (no asChild) */}
        <ContextMenuTrigger className="block">
          <SidebarMenuButton
            size="sm"
            tabIndex={-1}
            isActive={active}
            onClick={onActivate}
            style={indent}
            className={cn("font-mono text-xs", cursor && "ring-1 ring-sidebar-ring")}
          >
            {icons}
            <span className="truncate">{node.name}</span>
          </SidebarMenuButton>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-40">
          <ContextMenuItem onClick={onRename}>Rename…</ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onClick={onDelete}>
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </SidebarMenuItem>
  )
}
