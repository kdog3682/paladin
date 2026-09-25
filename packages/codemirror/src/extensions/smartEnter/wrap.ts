import { indentUnit } from '@codemirror/language'
import { type Text } from '@codemirror/state'
import { type Command } from '@codemirror/view'
import { leadingWhitespace } from '../lineUtils'

const WRAP_RE = /^([ \t]*)wrap[ \t]+(\S.*?)[ \t]*$/
const KEY_RE = /^(\S+)[ \t]+(\S.*)$/

/** last line of the contiguous, non-blank run below `line` whose indent is at
 * least the first line's indent (and deeper-or-equal to `min`); `line` itself
 * when there is none */
function contiguousEnd(doc: Text, line: number, min: number): number {
  if (line + 1 > doc.lines) return line
  const first = doc.line(line + 1).text
  if (!first.trim()) return line
  const base = leadingWhitespace(first).length
  if (base < min) return line
  let end = line
  for (let n = line + 1; n <= doc.lines; n++) {
    const text = doc.line(n).text
    if (!text.trim()) continue
    if (leadingWhitespace(text).length < base) break
    end = n
  }
  return end
}

/** turn `wrap foobar` + the contiguous lines under it into `foobar <cursor> { … }`;
 * `wrap left: stuff` becomes `left: {\n  stuff\n}`.
 * returns false when the cursor line is not a `wrap` line */
export const executeWrap: Command = (view) => {
  const { state } = view
  if (state.readOnly) return false
  const { doc } = state
  const line = doc.lineAt(state.selection.main.head)
  const match = WRAP_RE.exec(line.text)
  if (!match) return false
  const [, indent, rest] = match as unknown as [string, string, string]
  const unit = state.facet(indentUnit)
  const keyed = KEY_RE.exec(rest)
  const word = keyed ? keyed[1]! : rest
  const inline = keyed ? keyed[2]! : null

  let end = contiguousEnd(doc, line.number, indent.length)
  if (inline?.endsWith('{') && end < doc.lines) {
    const next = doc.line(end + 1).text
    if (leadingWhitespace(next) === indent && next.trimStart().startsWith('}')) end++
  }
  const body: string[] = inline === null ? [] : [indent + unit + inline]
  for (let n = line.number + 1; n <= end; n++) {
    const text = doc.line(n).text
    body.push(text.length ? unit + text : text)
  }

  const head = `${indent}${word} `
  const insert = inline === null
    ? head + ' {' + (body.length ? '\n' + body.join('\n') : '') + '\n' + indent + '}'
    : head + '{\n' + body.join('\n') + '\n' + indent + '}'
  const cursor = line.from + indent.length + word.length
  view.dispatch({
    changes: { from: line.from, to: doc.line(end).to, insert },
    selection: { anchor: cursor },
    scrollIntoView: true,
    userEvent: 'input.wrap',
  })
  return true
}
