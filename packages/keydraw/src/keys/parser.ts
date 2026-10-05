import { lookup, type Leaf, type TrieNode } from "./trie"

export type ParseResult =
  | { type: "command", id: string, count: number | null, keys: string[] }
  | {
    type: "pending"
    keys: string[]
    count: number | null
    /* the sequence is complete but also a prefix (y vs ys); flush after a timeout */
    ambiguous: boolean
  }
  /* unmatched keys; typing contexts insert them as text */
  | { type: "none", keys: string[] }

export type FeedOpts = {
  /* accumulate leading digits as a count (off in typing contexts) */
  counts?: boolean
}

export type KeyParser = {
  feed: (trie: TrieNode, key: string, opts?: FeedOpts) => ParseResult[]
  /* resolves an ambiguous pending sequence */
  flush: (trie: TrieNode) => ParseResult[]
  reset: () => void
  pending: () => { keys: string[], count: number | null }
}

export function createParser(): KeyParser {
  let buf: string[] = []
  let countStr = ""

  const count = () => (countStr ? Number(countStr) : null)
  const reset = () => {
    buf = []
    countStr = ""
  }

  /* aliases expand once and only resolve to bindings (noremap) */
  function resolve(trie: TrieNode, leaf: Leaf, keys: string[]): ParseResult {
    const c = count()
    reset()
    if (leaf.kind === "cmd") return { type: "command", id: leaf.id, count: c, keys }
    const target = lookup(trie, leaf.keys)
    if (target?.leaf?.kind === "cmd") return { type: "command", id: target.leaf.id, count: c, keys }
    return { type: "none", keys: leaf.keys }
  }

  function feed(trie: TrieNode, key: string, opts: FeedOpts = {}): ParseResult[] {
    const counts = opts.counts ?? true
    if (counts && !buf.length && /^\d$/.test(key) && (key !== "0" || countStr) && !trie.next.has(key)) {
      countStr += key
      return [{ type: "pending", keys: [], count: count(), ambiguous: false }]
    }
    const prev = buf.length ? lookup(trie, buf) : undefined
    const keys = [...buf, key]
    const node = lookup(trie, keys)
    if (!node) {
      if (prev?.leaf) {
        const first = resolve(trie, prev.leaf, buf)
        return [first, ...feed(trie, key, opts)]
      }
      const digits = countStr ? countStr.split("") : []
      reset()
      return [{ type: "none", keys: [...digits, ...keys] }]
    }
    buf = keys
    if (node.leaf && node.next.size === 0) return [resolve(trie, node.leaf, keys)]
    return [{ type: "pending", keys, count: count(), ambiguous: !!node.leaf }]
  }

  function flush(trie: TrieNode): ParseResult[] {
    if (!buf.length) {
      reset()
      return []
    }
    const node = lookup(trie, buf)
    if (node?.leaf) return [resolve(trie, node.leaf, buf)]
    const keys = buf
    reset()
    return [{ type: "none", keys }]
  }

  return {
    feed,
    flush,
    reset,
    pending: () => ({ keys: [...buf], count: count() }),
  }
}
