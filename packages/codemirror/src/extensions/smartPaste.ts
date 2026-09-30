import { indentUnit } from '@codemirror/language'
import {
  countColumn,
  EditorSelection,
  type EditorState,
  type SelectionRange,
  type TransactionSpec,
} from '@codemirror/state'
import { type EditorView } from '@codemirror/view'
import { leadingWhitespace, parseLinePrefix, repeatMarker } from './lineUtils'

export type SmartPasteOpts = {
  /* column past which pasted lines are broken up, default 80 */
  maxWidth?: number
}

export type WrapLineOpts = {
  /* column limit */
  maxWidth: number
  /* tab width for column counting */
  tabSize: number
  /* indent unit added to continuation lines of code */
  unit: string
  /* never break before this index (text already in the doc) */
  minBreak?: number
}

const NUMBERED_RE = /^\d+[.)] /
const CODE_RE = /[{}()[\];=]/

/** prefix for the lines a long line is broken into: comment and `*` markers
 * repeat, list items hang under their text, code gets one extra indent unit */
export function continuationPrefix(line: string, unit: string): string {
  const { indent, marker, rest } = parseLinePrefix(line)
  if (marker.startsWith('/')) return indent + repeatMarker(marker)
  if (marker.startsWith('*')) return indent + '* '
  if (marker.startsWith('-')) return indent + '  '
  const numbered = NUMBERED_RE.exec(rest)
  if (numbered) return indent + ' '.repeat(numbered[0].length)
  return CODE_RE.test(rest) ? indent + unit : indent
}

function prefixLength(line: string): number {
  const { indent, marker, rest } = parseLinePrefix(line)
  return indent.length + marker.length + (NUMBERED_RE.exec(rest)?.[0].length ?? 0)
}

/** indices of whitespace a line may be broken at: after `floor`, following
 * real content, and (unless `ignoreQuotes`) outside string literals */
function breakCandidates(text: string, floor: number, ignoreQuotes: boolean): number[] {
  const out: number[] = []
  let quote: string | null = null
  let seenContent = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }
    const space = ch === ' ' || ch === '\t'
    if (!ignoreQuotes && (ch === '"' || ch === '`' || (ch === '\'' && !/\w/.test(text[i - 1] ?? '')))) {
      quote = ch
    } else if (space && i > floor && seenContent && !/[ \t]/.test(text[i - 1]!)) {
      out.push(i)
    }
    if (i >= floor && !space) seenContent = true
  }
  return out
}

/** last break that fits in maxWidth, else the first one past it (overflow
 * rather than split a word). -1 when the line cannot be broken */
function findBreak(text: string, floor: number, opts: WrapLineOpts, prose: boolean): number {
  let candidates = breakCandidates(text, floor, prose)
  // an unbalanced quote swallowed everything, retry treating quotes as text
  if (!candidates.length && !prose) candidates = breakCandidates(text, floor, true)
  if (!candidates.length) return -1
  let best = -1
  for (const i of candidates) {
    if (countColumn(text.slice(0, i), opts.tabSize) <= opts.maxWidth) best = i
    else break
  }
  return best >= 0 ? best : candidates[0]!
}

/** break a line that runs past maxWidth into several, keeping its indent and
 * comment / list marker */
export function wrapLine(line: string, opts: WrapLineOpts): string[] {
  if (countColumn(line, opts.tabSize) <= opts.maxWidth) return [line]
  const { marker } = parseLinePrefix(line)
  const prose = marker !== '' || NUMBERED_RE.test(line.trimStart())
  const cont = continuationPrefix(line, opts.unit)
  const out: string[] = []
  let rest = line
  let floor = Math.max(opts.minBreak ?? 0, prefixLength(line))
  while (countColumn(rest, opts.tabSize) > opts.maxWidth) {
    const at = findBreak(rest, floor, opts, prose)
    if (at < 0) break
    out.push(rest.slice(0, at).trimEnd())
    rest = cont + rest.slice(at).trimStart()
    floor = cont.length
  }
  out.push(rest)
  return out
}

/** reindent pasted text to the cursor's line and wrap long lines */
export function reflowPaste(state: EditorState, range: SelectionRange, text: string, maxWidth: number): string {
  const line = state.doc.lineAt(range.from)
  const before = line.text.slice(0, range.from - line.from)
  const target = leadingWhitespace(before)
  const pieces = text.split('\n')
  const opts: WrapLineOpts = { maxWidth, tabSize: state.tabSize, unit: state.facet(indentUnit) }

  // common indent of the pasted block. the first line is often copied from
  // mid-line, so it only counts when it carries its own indent
  const first = pieces[0]!
  const firstIndent = leadingWhitespace(first)
  const measured = pieces.slice(1).filter((p) => p.trim()).map((p) => leadingWhitespace(p).length)
  if (firstIndent) measured.push(firstIndent.length)
  const common = measured.length ? Math.min(...measured) : 0

  const reindented = pieces.map((p, i) => {
    if (i === 0) {
      if (pieces.length === 1) return p
      return before.trim() ? p.trimStart() : firstIndent.slice(common) + p.trimStart()
    }
    // the last line gets the indent so text after the cursor stays aligned
    if (!p.trim()) return i === pieces.length - 1 ? target : ''
    return target + p.slice(common)
  })

  const out: string[] = []
  reindented.forEach((l, i) => {
    if (i > 0) return void out.push(...wrapLine(l, opts))
    const parts = wrapLine(before + l, { ...opts, minBreak: before.length })
    parts[0] = parts[0]!.slice(before.length)
    out.push(...parts)
  })
  return out.join('\n')
}

export function pasteTransaction(state: EditorState, text: string, maxWidth = 80): TransactionSpec {
  const clean = text.replace(/\r\n?/g, '\n')
  const lines = clean.split('\n')
  const { ranges } = state.selection
  // one line per cursor, like the default paste
  const perRange = ranges.length > 1 && lines.length === ranges.length
  let i = 0
  const tr = state.changeByRange((range) => {
    const insert = reflowPaste(state, range, perRange ? lines[i++]! : clean, maxWidth)
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(range.from + insert.length),
    }
  })
  return { ...tr, scrollIntoView: true, userEvent: 'input.paste' }
}

/** paste event handler that respects the cursor line's indent and breaks
 * lines past maxWidth */
export function handleSmartPaste(opts: SmartPasteOpts = {}) {
  const maxWidth = opts.maxWidth ?? 80
  return (event: ClipboardEvent, view: EditorView): boolean => {
    const text = event.clipboardData?.getData('text/plain')
    if (!text || view.state.readOnly) return false
    if (!text.includes('\n')) return false
    event.preventDefault()
    view.dispatch(pasteTransaction(view.state, text, maxWidth))
    return true
  }
}
