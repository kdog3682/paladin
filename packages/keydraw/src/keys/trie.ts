import { effectiveKeymap, type Keymap, type KeymapOverride } from "./keymap.default"
import { parseSeq } from "./notation"

export type Leaf = { kind: "cmd", id: string } | { kind: "alias", keys: string[] }

export type TrieNode = {
  leaf?: Leaf
  next: Map<string, TrieNode>
}

export function buildTrie(entries: [string[], Leaf][]): TrieNode {
  const root: TrieNode = { next: new Map() }
  for (const [keys, leaf] of entries) {
    let n = root
    for (const k of keys) {
      let c = n.next.get(k)
      if (!c) n.next.set(k, (c = { next: new Map() }))
      n = c
    }
    n.leaf = leaf
  }
  return root
}

export function lookup(trie: TrieNode, keys: string[]): TrieNode | undefined {
  let n: TrieNode | undefined = trie
  for (const k of keys) {
    n = n.next.get(k)
    if (!n) return undefined
  }
  return n
}

/* every leaf below a node, for which-key */
export function continuations(node: TrieNode, prefix: string[] = []): { keys: string[], leaf: Leaf }[] {
  const out: { keys: string[], leaf: Leaf }[] = []
  for (const [k, child] of node.next) {
    const keys = [...prefix, k]
    if (child.leaf) out.push({ keys, leaf: child.leaf })
    out.push(...continuations(child, keys))
  }
  return out
}

/* mode tables first, then state tables; later entries replace earlier ones */
export function buildScopeTrie(km: Keymap, mode: string, state?: string): TrieNode {
  const entries = new Map<string, Leaf>()
  const add = (table: Record<string, string> | undefined, kind: Leaf["kind"]) => {
    for (const [lhs, rhs] of Object.entries(table ?? {})) {
      const leaf: Leaf = kind === "cmd" ? { kind, id: rhs } : { kind, keys: parseSeq(rhs) }
      entries.set(parseSeq(lhs).join("\u0000"), leaf)
    }
  }
  add(km.bindings[mode], "cmd")
  add(km.aliases[mode], "alias")
  if (state) {
    add(km.bindings[`${mode}:${state}`], "cmd")
    add(km.aliases[`${mode}:${state}`], "alias")
  }
  return buildTrie([...entries].map(([k, leaf]) => [k.split("\u0000"), leaf]))
}

const cache = new WeakMap<KeymapOverride, Map<string, TrieNode>>()

/* memoized per override object and scope */
export function getTrie(override: KeymapOverride, mode: string, state?: string): TrieNode {
  let byScope = cache.get(override)
  if (!byScope) cache.set(override, (byScope = new Map()))
  const key = state ? `${mode}:${state}` : mode
  let t = byScope.get(key)
  if (!t) byScope.set(key, (t = buildScopeTrie(effectiveKeymap(override), mode, state)))
  return t
}
