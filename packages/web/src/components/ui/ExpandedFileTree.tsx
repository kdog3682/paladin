// src/components/ui/ExpandedFileTree.tsx

import { useMemo } from 'react'
import { cn } from '@bklearn/shadcn'

// ─── Types ───────────────────────────────────────────────────────────

export interface FileTreeEntry {
  path: string
}

interface TreeNode {
  name: string
  fullPath: string | null // null for directories
  children: TreeNode[]
  isDir: boolean
}

interface ExpandedFileTreeProps {
  entries: FileTreeEntry[]
  selectedPath: string | null
  onSelect: (path: string) => void
  className?: string
}

// ─── Tree building ───────────────────────────────────────────────────

/**
 * Groups files by their root directory (e.g. @paladin/ai).
 * Swallows /src/ if ALL files under that root go through src/.
 * Builds a fully expanded tree.
 */
function buildTree(entries: FileTreeEntry[]): TreeNode[] {
  // normalize paths: /home/<user>/projects/<project>/packages/<pkg>/...
  // → @<project>/<pkg>/...
  const normalized = entries.map(e => {
    const p = e.path
      .replace(/^\/home\/\w+\/projects\//, '@')
    return { original: e.path, display: p }
  })

  // group by root (first two segments: @project/pkg)
  const groups = new Map<string, { original: string, rest: string }[]>()
  for (const { original, display } of normalized) {
    const parts = display.split('/')
    const root = parts.slice(0, 2).join('/')
    const rest = parts.slice(2).join('/')
    const group = groups.get(root) ?? []
    group.push({ original, rest })
    groups.set(root, group)
  }

  const roots: TreeNode[] = []

  for (const [root, files] of groups) {
    // check if we can swallow /src/
    const allThroughSrc = files.every(f => f.rest.startsWith('src/'))
    const adjusted = allThroughSrc
      ? files.map(f => ({ ...f, rest: f.rest.slice(4) })) // remove "src/"
      : files

    const rootNode: TreeNode = {
      name: root,
      fullPath: null,
      children: [],
      isDir: true,
    }

    // insert each file into the tree
    for (const { original, rest } of adjusted) {
      const segments = rest.split('/')
      let parent = rootNode

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]
        const isLast = i === segments.length - 1

        if (isLast) {
          parent.children.push({
            name: seg,
            fullPath: original,
            children: [],
            isDir: false,
          })
        } else {
          let dir = parent.children.find(c => c.isDir && c.name === seg)
          if (!dir) {
            dir = { name: seg, fullPath: null, children: [], isDir: true }
            parent.children.push(dir)
          }
          parent = dir
        }
      }
    }

    // collapse single-child directory chains: a/b/c → a/b/c
    collapseChains(rootNode)

    // sort: dirs first, then alpha
    sortTree(rootNode)
    roots.push(rootNode)
  }

  roots.sort((a, b) => a.name.localeCompare(b.name))
  return roots
}

function sortTree(node: TreeNode) {
  node.children.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  for (const child of node.children) {
    if (child.isDir) sortTree(child)
  }
}

/**
 * Collapse single-child directory chains.
 * If a dir has exactly one child and that child is also a dir,
 * merge them: abc/ → def/ → ghi.ts becomes abc/def/ → ghi.ts
 */
function collapseChains(node: TreeNode) {
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]
    if (!child.isDir) continue

    // keep collapsing while there's a single dir child
    let current = child
    const nameParts = [current.name]

    while (
      current.children.length === 1 &&
      current.children[0].isDir
    ) {
      current = current.children[0]
      nameParts.push(current.name)
    }

    if (nameParts.length > 1) {
      current.name = nameParts.join('/')
      node.children[i] = current
    }

    collapseChains(node.children[i])
  }
}

/**
 * Flattens the tree into a selectable list (files only) for keyboard nav.
 */
function collectSelectablePaths(nodes: TreeNode[]): string[] {
  const result: string[] = []
  function walk(n: TreeNode) {
    if (!n.isDir && n.fullPath) {
      result.push(n.fullPath)
    }
    for (const c of n.children) walk(c)
  }
  for (const r of nodes) walk(r)
  return result
}

// ─── Component ───────────────────────────────────────────────────────

export function ExpandedFileTree({
  entries,
  selectedPath,
  onSelect,
  className,
}: ExpandedFileTreeProps) {
  const tree = useMemo(() => buildTree(entries), [entries])

  return (
    <div className={cn('text-[11px] font-mono', className)}>
      {tree.map(root => (
        <div key={root.name} className="mb-2">
          <div className="font-bold text-neutral-700 mb-0.5">
            {root.name}
          </div>
          <TreeChildren
            nodes={root.children}
            depth={1}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        </div>
      ))}
    </div>
  )
}

function TreeChildren({
  nodes,
  depth,
  selectedPath,
  onSelect,
}: {
  nodes: TreeNode[]
  depth: number
  selectedPath: string | null
  onSelect: (path: string) => void
}) {
  return (
    <>
      {nodes.map((node, i) => (
        <TreeRow
          key={node.name + i}
          node={node}
          depth={depth}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}

function TreeRow({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: TreeNode
  depth: number
  selectedPath: string | null
  onSelect: (path: string) => void
}) {
  const paddingLeft = depth * 12

  if (node.isDir) {
    return (
      <>
        <div
          className="text-neutral-400 py-px"
          style={{ paddingLeft }}
        >
          {node.name}
        </div>
        <TreeChildren
          nodes={node.children}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      </>
    )
  }

  const isActive = node.fullPath === selectedPath

  return (
    <button
      onClick={() => node.fullPath && onSelect(node.fullPath)}
      className={cn(
        'block w-full text-left py-px rounded-sm transition-colors',
        isActive
          ? 'bg-blue-50 text-blue-700'
          : 'text-neutral-600 hover:bg-neutral-50',
      )}
      style={{ paddingLeft }}
    >
      {node.name}
    </button>
  )
}

// re-export for keyboard nav
export { collectSelectablePaths, buildTree }
