import { THEME_COLORS } from "../props/parse"
import { PROPS, byAlias, isNumeric } from "../props/registry"
import { lastWord } from "./tokenize"

let cache: string[] | null = null

function vocabulary(): string[] {
  if (cache) return cache
  const words = new Set<string>(["flex", "grid", "abs"])
  for (const d of PROPS) {
    for (const a of d.aliases) {
      words.add(a)
      const vals = d.kind === "color" ? THEME_COLORS : d.kind === "bool" ? ["off"] : (d.values ?? [])
      for (const v of vals) words.add(`${a}:${v}`)
      for (const k of d.keywords ?? []) words.add(`${a}:${k}`)
    }
  }
  cache = [...words].sort((a, b) => a.length - b.length || a.localeCompare(b))
  return cache
}

/* ghost text completing the last word; `extra` adds styles, icons, components */
export function ghost(line: string, extra: string[] = []): string {
  const word = lastWord(line)
  if (!word) return ""
  const exact = byAlias.get(word)
  if (exact && isNumeric(exact)) return ""
  const hit = [...extra, ...vocabulary()].find(w => w.length > word.length && w.startsWith(word))
  return hit ? hit.slice(word.length) : ""
}
