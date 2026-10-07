import { isolateHistory } from '@codemirror/commands'
import type { Command } from '@codemirror/view'
import { vimEdit } from './state'

export const DEFAULT_CYCLES: string[][] = [
  ['width', 'height'],
  ['north', 'east', 'south', 'west'],
  ['left', 'right'],
  ['top', 'bottom'],
  ['up', 'down'],
  ['true', 'false'],
  ['yes', 'no'],
  ['on', 'off'],
  ['min', 'max'],
  ['row', 'column'],
  ['horizontal', 'vertical'],
  ['start', 'end'],
  ['first', 'last'],
  ['before', 'after'],
  ['show', 'hide'],
  ['enable', 'disable'],
  ['open', 'close'],
  ['let', 'const'],
  ['and', 'or'],
]

export type CycleToken = {
  /* offset of the replaced token within the line */
  from: number
  /* end offset of the replaced token within the line */
  to: number
  /* the replacement text */
  insert: string
}

export type CycleWordOpts = {
  /* 1 cycles forward (width -> height, 5 -> 6, a -> b), -1 backward */
  dir?: 1 | -1
  /* word groups to cycle through, defaults to DEFAULT_CYCLES */
  cycles?: string[][]
}

// a number with an optional sign and unit (5, -2, 0.023m, 12px, 50%) or an identifier.
// the sign only counts when not glued to a word, so `x-5` is `x` and `5`
const TOKEN = /((?<![\w.])-)?(\d+(?:\.\d+)?)([a-zA-Z%]*)|([A-Za-z_]\w*)/g

const lookups = new WeakMap<string[][], Map<string, string[]>>()

const lookupFor = (cycles: string[][]) => {
  let map = lookups.get(cycles)
  if (!map) {
    map = new Map()
    for (const group of cycles) {
      const lower = group.map(w => w.toLowerCase())
      for (const word of lower) map.set(word, lower)
    }
    lookups.set(cycles, map)
  }
  return map
}

/** step a number by one unit of its last decimal place, keeping the precision: 0.023 -> 0.024 */
export const incrementNumber = (negative: boolean, digits: string, dir: 1 | -1) => {
  const [int, frac = ''] = digits.split('.')
  const scaled = Number(int + frac) * (negative ? -1 : 1) + dir
  const abs = String(Math.abs(scaled)).padStart(frac.length + 1, '0')
  const body = frac.length ? `${abs.slice(0, -frac.length)}.${abs.slice(-frac.length)}` : abs
  return (scaled < 0 ? '-' : '') + body
}

const cycleLetter = (ch: string, dir: 1 | -1) => {
  const base = ch <= 'Z' ? 65 : 97
  return String.fromCharCode(base + (ch.charCodeAt(0) - base + dir + 26) % 26)
}

const matchCase = (source: string, word: string) => {
  if (source.length > 1 && source === source.toUpperCase()) return word.toUpperCase()
  if (source[0] !== source[0].toLowerCase()) return word[0].toUpperCase() + word.slice(1)
  return word
}

const cycleWordText = (word: string, dir: 1 | -1, lookup: Map<string, string[]>) => {
  if (/^[a-zA-Z]$/.test(word)) return cycleLetter(word, dir)
  const group = lookup.get(word.toLowerCase())
  if (!group) return null
  const i = group.indexOf(word.toLowerCase())
  return matchCase(word, group[(i + dir + group.length) % group.length])
}

/* a checklist box at the line start: only the two marks flip, `[✓]` <-> `[✗]` */
const BOX = /^[ \t]*(?:[-*] )?\[([✓✗])\]/

/** find the first cyclable token under or after col and compute its replacement */
export const cycleToken = (
  text: string,
  col: number,
  dir: 1 | -1 = 1,
  cycles: string[][] = DEFAULT_CYCLES,
): CycleToken | null => {
  const box = BOX.exec(text)
  if (box && box[0].length > col) {
    const to = box[0].length - 1
    return { from: to - 1, to, insert: box[1] === '✓' ? '✗' : '✓' }
  }
  const lookup = lookupFor(cycles)
  for (const m of text.matchAll(TOKEN)) {
    const from = m.index!
    const to = from + m[0].length
    if (to <= col) continue
    const insert = m[2] !== undefined
      ? incrementNumber(m[1] !== undefined, m[2], dir) + m[3]
      : cycleWordText(m[4], dir, lookup)
    if (insert !== null) return { from, to, insert }
  }
  return null
}

/** cycle the word / number / letter under the cursor: width -> height, 5px -> 6px, a -> b */
export const cycleWord = (opts: CycleWordOpts = {}): Command => view => {
  const { state } = view
  const head = state.selection.main.head
  const line = state.doc.lineAt(head)
  const col = head - line.from
  const token = cycleToken(line.text, col, opts.dir ?? 1, opts.cycles)
  if (!token) return false
  const from = line.from + token.from
  const offset = Math.max(0, Math.min(col - token.from, token.insert.length - 1))
  view.dispatch({
    changes: { from, to: line.from + token.to, insert: token.insert },
    selection: { anchor: from + offset },
    annotations: [vimEdit.of(true), isolateHistory.of('full')],
    userEvent: 'vim.cycle',
  })
  return true
}
