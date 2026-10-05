import { namedStyle } from "./styles"
import { byAlias, type PropDef } from "../props/registry"

export type Token = {
  /* the token text as typed (space-form tokens include both words) */
  raw: string
  /* the alias or name part that resolved to a prop */
  head?: string
  def?: PropDef
  /* raw value string handed to def.parse; "" for a bare word */
  value?: string
  /* parsed value; undefined when incomplete or invalid */
  parsed?: unknown
  /* true for the alias+number form, e.g. w20p */
  numeric?: boolean
}

/* bare words that set the layout prop */
const LAYOUT_WORDS: Record<string, string> = { flex: "flex", grid: "grid", abs: "absolute" }

const NUMERIC = /^([a-zA-Z]+)(\d+(?:\.\d+)?)(p|%)?$/

function bareValue(def: PropDef): unknown {
  if (def.kind === "bool" || def.kind === "enum" || def.kind === "preset") return def.parse("")
  return undefined
}

export function parseWord(raw: string): Token {
  if (raw in LAYOUT_WORDS) {
    const v = LAYOUT_WORDS[raw]
    return { raw, head: "layout", def: byAlias.get("layout"), value: v, parsed: v }
  }
  const exact = byAlias.get(raw)
  if (exact) return { raw, head: raw, def: exact, value: "", parsed: bareValue(exact) }
  for (let i = raw.lastIndexOf(":"); i > 0; i = raw.lastIndexOf(":", i - 1)) {
    const head = raw.slice(0, i)
    const def = byAlias.get(head)
    if (def) {
      const value = raw.slice(i + 1)
      return { raw, head, def, value, parsed: value === "" ? undefined : def.parse(value) }
    }
  }
  const m = NUMERIC.exec(raw)
  if (m) {
    const def = byAlias.get(m[1])
    if (def && (def.kind === "length" || def.kind === "number")) {
      const value = m[2] + (m[3] ? "p" : "")
      return { raw, head: m[1], def, value, parsed: def.parse(value), numeric: true }
    }
  }
  return { raw }
}

/* splits on spaces and commas; accepts the space form `bg primary` as well as `bg:primary` */
export function tokenize(line: string): Token[] {
  const words = line
    .split(/[\s,]+/)
    .filter(Boolean)
    .flatMap(w => {
      const style = namedStyle(w)
      return style ? style.split(/[\s,]+/).filter(Boolean) : [w]
    })
  const out: Token[] = []
  for (let i = 0; i < words.length; i++) {
    const t = parseWord(words[i])
    const next = words[i + 1]
    if (t.def && t.value === "" && next !== undefined && t.def.kind !== "bool" && !parseWord(next).def) {
      const parsed = t.def.parse(next)
      if (parsed !== undefined) {
        out.push({ ...t, raw: `${t.raw} ${next}`, value: next, parsed })
        i++
        continue
      }
    }
    out.push(t)
  }
  return out
}

/* the word being typed at the end of the line ("" after a separator) */
export function lastWord(line: string): string {
  return /[^\s,]*$/.exec(line)?.[0] ?? ""
}
