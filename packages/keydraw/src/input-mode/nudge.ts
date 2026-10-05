import { isLength, round } from "../props/parse"
import type { PropDef } from "../props/registry"
import { lastWord, parseWord } from "./tokenize"

/* nudges a stored value; undefined starts from 0 */
export function nudgeValue(def: PropDef, v: unknown, delta: number): unknown {
  if (typeof v === "number") return Math.max(0, round(v + delta))
  if (isLength(v)) return { ...v, n: Math.max(0, round(v.n + delta)) }
  if (v === undefined) {
    if (def.kind === "number") return Math.max(0, delta)
    if (def.kind === "length") return { n: Math.max(0, delta), unit: "px" }
  }
  return v
}

/* nudges the number of the token being typed; null when it isn't numeric */
export function nudgeLine(line: string, delta: number): string | null {
  const word = lastWord(line)
  const t = parseWord(word)
  if (!t.numeric) return null
  const m = /(\d+(?:\.\d+)?)(p|%)?$/.exec(word)
  if (!m) return null
  const n = Math.max(0, round(Number(m[1]) + delta))
  return line.slice(0, line.length - m[0].length) + n + (m[2] ?? "")
}
