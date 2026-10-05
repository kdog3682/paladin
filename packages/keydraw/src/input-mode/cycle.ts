import { cycleValues, isToggleable, valueKey } from "../props/registry"
import { lastWord, parseWord } from "./tokenize"

/* Space in a typing line: the line with its last token cycled, or null when it should just end the token */
export function cycleLine(line: string, dir: 1 | -1): string | null {
  const word = lastWord(line)
  if (!word) return null
  const t = parseWord(word)
  if (!t.def || !isToggleable(t.def)) return null
  const vals = cycleValues(t.def)
  if (!vals.length) return null
  const cur = t.value ? vals.indexOf(t.value) : t.parsed !== undefined ? vals.indexOf(valueKey(t.def, t.parsed)) : -1
  const i = cur < 0 ? (dir > 0 ? 0 : vals.length - 1) : (cur + dir + vals.length) % vals.length
  return `${line.slice(0, line.length - word.length)}${t.head}:${vals[i]}`
}
