import { Folder } from 'lucide-react'

export type TreeNode =
  | { type: 'file'; name: string; path: string }
  | { type: 'dir'; name: string; path: string; children: TreeNode[] }

/** Builds a nested TreeNode[] from a flat list of `/`-separated relative paths. Dirs sort before files, alphabetically within each. */
export function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = []
  for (const filePath of paths) {
    const parts = filePath.split('/')
    let level = root
    let acc = ''
    parts.forEach((part, i) => {
      acc = acc ? `${acc}/${part}` : part
      const isFile = i === parts.length - 1
      let node = level.find((n) => n.name === part && n.type === (isFile ? 'file' : 'dir'))
      if (!node) {
        node = isFile
          ? { type: 'file', name: part, path: acc }
          : { type: 'dir', name: part, path: acc, children: [] }
        level.push(node)
      }
      if (node.type === 'dir') level = node.children
    })
  }
  const sortLevel = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
    for (const n of nodes) if (n.type === 'dir') sortLevel(n.children)
  }
  sortLevel(root)
  return root
}

/** Returns all file paths (no dirs) in a tree, depth-first. */
export function flattenFiles(nodes: TreeNode[]): string[] {
  const out: string[] = []
  for (const n of nodes) {
    if (n.type === 'file') out.push(n.path)
    else out.push(...flattenFiles(n.children))
  }
  return out
}

/** Flattens a tree to its currently visible rows in display order, skipping children of any dir path in `collapsed`. */
export function flattenVisible(nodes: TreeNode[], collapsed: Set<string>): TreeNode[] {
  const out: TreeNode[] = []
  for (const n of nodes) {
    out.push(n)
    if (n.type === 'dir' && !collapsed.has(n.path)) {
      out.push(...flattenVisible(n.children, collapsed))
    }
  }
  return out
}

/** Nesting depth of a `/`-joined path. */
export function depthOf(path: string) {
  return path.split('/').length - 1
}

export interface TreeViewColors {
  muted: string
  accentBg: string
  fg: string
  markColor: string
}

/** Renders a file/dir tree with click-to-focus, collapse state, focus highlight, and marked-file coloring. */
export function TreeView({
  nodes,
  depth,
  focused,
  marks,
  collapsed,
  onFocus,
  colors,
}: {
  nodes: TreeNode[]
  depth: number
  focused: string | null
  marks: Set<string>
  collapsed: Set<string>
  onFocus: (path: string) => void
  colors: TreeViewColors
}) {
  return (
    <>
      {nodes.map((n) => {
        const isFocused = n.path === focused
        if (n.type === 'dir') {
          const isCollapsed = collapsed.has(n.path)
          return (
            <div key={n.path}>
              <div
                onClick={() => onFocus(n.path)}
                style={{
                  paddingLeft: 8 + depth * 12,
                  color: colors.muted,
                  backgroundColor: isFocused ? colors.accentBg : 'transparent',
                }}
                className="px-2 py-1 text-sm cursor-pointer select-none flex items-center gap-1.5 hover:opacity-80"
              >
                <span className="w-4 inline-block text-base leading-none">{isCollapsed ? '▸' : '▾'}</span>
                <Folder size={14} style={{ color: colors.muted }} />
                <span className="truncate font-medium">{n.name}</span>
              </div>
              {!isCollapsed && (
                <TreeView
                  nodes={n.children}
                  depth={depth + 1}
                  focused={focused}
                  marks={marks}
                  collapsed={collapsed}
                  onFocus={onFocus}
                  colors={colors}
                />
              )}
            </div>
          )
        }
        const isMarked = marks.has(n.path)
        return (
          <div
            key={n.path}
            onClick={() => onFocus(n.path)}
            style={{
              paddingLeft: 24 + depth * 12,
              backgroundColor: isFocused ? colors.accentBg : 'transparent',
              color: isMarked ? colors.markColor : colors.fg,
            }}
            className="px-2 py-1 text-sm cursor-pointer truncate"
          >
            <span className="truncate">{n.name}</span>
          </div>
        )
      })}
    </>
  )
}
