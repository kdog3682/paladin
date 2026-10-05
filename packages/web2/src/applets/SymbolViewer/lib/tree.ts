import type { FsNode } from "../api"

export type TreeRow = {
  node: FsNode
  depth: number
  /* absolute path of the parent dir row, null at top level */
  parent: string | null
}

export function sortNodes(nodes: FsNode[]): FsNode[] {
  return [...nodes].sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1,
  )
}

/* visible rows given the expanded set. the root node itself is not a row */
export function flattenVisible(
  nodes: FsNode[],
  expanded: Record<string, true>,
  depth = 0,
  parent: string | null = null,
  out: TreeRow[] = [],
): TreeRow[] {
  for (const node of sortNodes(nodes)) {
    out.push({ node, depth, parent })
    if (node.kind === "dir" && expanded[node.path] && node.children)
      flattenVisible(node.children, expanded, depth + 1, node.path, out)
  }
  return out
}

export function walk(node: FsNode, fn: (n: FsNode) => void) {
  fn(node)
  node.children?.forEach((c) => walk(c, fn))
}

export function collectPaths(root: FsNode | undefined): Set<string> {
  const out = new Set<string>()
  if (root) walk(root, (n) => out.add(n.path))
  return out
}

export function collectFiles(root: FsNode | undefined): FsNode[] {
  const out: FsNode[] = []
  if (root) walk(root, (n) => n.kind === "file" && out.push(n))
  return out
}
