export type FileEntry = [file: string, symbols: string[]]

export type FancyFileTreeOptions = {
  /** collapse single-child directory chains, e.g. `math/expr/select.ts` (default true) */
  concat?: boolean
  /** explicit home dir to fold into `~`, otherwise `/home/<name>` and `/Users/<name>` */
  home?: string
  /** spaces added per depth level (default 1) */
  indent?: number
  /** spaces before the first level, when a root header is printed (default 1) */
  offset?: number
  /** extra spaces for symbols, relative to their file (default 2) */
  symbolIndent?: number
}

const HOME_RE = /^\/(?:home|Users)\/[^/]+/

/** turn `/home/<name>/projects/x` into `~/projects/x` */
export function unexpand(path: string, home?: string): string {
  if (home) {
    const h = home.replace(/\/+$/, "")
    if (h.length > 0) {
      if (path === h) return "~"
      if (path.startsWith(h + "/")) return "~" + path.slice(h.length)
    }
  }

  const m = HOME_RE.exec(path)
  if (!m) return path

  const rest = path.slice(m[0].length)
  if (rest.length > 0 && !rest.startsWith("/")) return path
  return rest.length === 0 ? "~" : "~" + rest
}

type Node = {
  name: string
  children: Map<string, Node>
  file: boolean
  symbols: string[]
}

function node(name: string): Node {
  return { name, children: new Map(), file: false, symbols: [] }
}

function segments(path: string): string[] {
  const parts = path.split("/")
  const out: string[] = []
  for (let i = 0; i < parts.length; i++) {
    const s = parts[i]
    if (s === "") {
      // keep a leading empty segment so joins stay absolute
      if (i === 0) out.push("")
      continue
    }
    if (s === ".") continue
    out.push(s)
  }
  return out
}

function joinSegments(segs: string[]): string {
  if (segs.length === 0) return ""
  if (segs.length === 1) return segs[0] === "" ? "/" : segs[0]
  return segs.join("/")
}

function commonPrefix(lists: string[][]): string[] {
  if (lists.length === 0) return []
  let prefix = lists[0]
  for (const list of lists.slice(1)) {
    let i = 0
    while (i < prefix.length && i < list.length && prefix[i] === list[i]) i++
    prefix = prefix.slice(0, i)
    if (prefix.length === 0) break
  }
  return prefix
}

function sortChildren(n: Node): Node[] {
  return [...n.children.values()].sort((a, b) => {
    const ad = a.children.size > 0 ? 0 : 1
    const bd = b.children.size > 0 ? 0 : 1
    if (ad !== bd) return ad - bd
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  })
}

export function fancyFileTree(
  entries: readonly FileEntry[],
  options: FancyFileTreeOptions = {},
): string {
  const { concat = true, home, indent = 1, offset = 1, symbolIndent = 2 } = options
  if (entries.length === 0) return ""

  const paths = entries.map(([file]) => segments(unexpand(file, home)))
  const root = commonPrefix(paths.map(p => p.slice(0, -1)))
  const rootLabel = joinSegments(root)
  const hasRoot = rootLabel.length > 0

  const tree = node("")
  for (let i = 0; i < entries.length; i++) {
    const rest = paths[i].slice(root.length)
    if (rest.length === 0) continue

    let cur = tree
    for (const name of rest) {
      let next = cur.children.get(name)
      if (!next) {
        next = node(name)
        cur.children.set(name, next)
      }
      cur = next
    }

    cur.file = true
    for (const symbol of entries[i][1] ?? []) {
      if (!cur.symbols.includes(symbol)) cur.symbols.push(symbol)
    }
  }

  const lines: string[] = []
  if (hasRoot) lines.push(rootLabel)

  const pad = (depth: number) => " ".repeat(depth * indent + (hasRoot ? offset : 0))

  const walk = (n: Node, depth: number) => {
    for (const child of sortChildren(n)) {
      let label = child.name
      let cur = child

      if (concat) {
        while (!cur.file && cur.children.size === 1) {
          const only = cur.children.values().next().value as Node
          label += "/" + only.name
          cur = only
        }
      }

      const isDir = cur.children.size > 0 || !cur.file
      lines.push(pad(depth) + label + (isDir ? "/" : ""))
      for (const symbol of cur.symbols) {
        lines.push(pad(depth) + " ".repeat(symbolIndent) + symbol)
      }
      walk(cur, depth + 1)
    }
  }

  walk(tree, hasRoot ? 1 : 0)
  return lines.join("\n")
}
