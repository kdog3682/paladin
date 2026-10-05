import { currentRoot, readingOrder } from "../model/tree"
import type { Doc } from "../model/types"

export const HINT_ALPHABET = "asdfghjklqwertyuiopzxcvbnm"

/* fixed-length labels, so none is a prefix of another */
export function makeLabels(n: number, alphabet = HINT_ALPHABET): string[] {
  if (n <= 0) return []
  let len = 1
  while (alphabet.length ** len < n) len++
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    let s = ""
    let x = i
    for (let j = 0; j < len; j++) {
      s = alphabet[x % alphabet.length] + s
      x = Math.floor(x / alphabet.length)
    }
    out.push(s)
  }
  return out
}

/* v1: every non-hidden node on the current artboard (not yet clipped to the viewport) */
export function hintTargets(doc: Doc): string[] {
  return readingOrder(doc, currentRoot(doc)).filter(id => !doc.nodes[id].hidden)
}

export function assignHints(ids: string[]): { id: string, label: string }[] {
  const labels = makeLabels(ids.length)
  return ids.map((id, i) => ({ id, label: labels[i] }))
}
