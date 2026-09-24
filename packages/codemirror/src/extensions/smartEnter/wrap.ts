import { indentUnit } from '@codemirror/language'
import { type Text } from '@codemirror/state'
import { type Command } from '@codemirror/view'
import { leadingWhitespace } from '../lineUtils'

const WRAP_RE = /^([ \t]*)wrap[ \t]+(\S.*?)[ \t]*$/
const OPENS_BLOCK_RE = /\{[ \t]*$/
const ONE_LINE_BLOCK_RE = /\{.*\}[ \t]*$/

/** last line of the `{ … }` block starting at `openLine`: the first `}` line at
 * the opener's indent. null when the code dedents past it first */
function findBlockEnd(doc: Text, openLine: number): number | null {
  const indent = leadingWhitespace(doc.line(openLine).text)
  for (let n = openLine + 1; n <= doc.lines; n++) {
    const text = doc.line(n).text
    if (!text.trim()) continue
    const ws = leadingWhitespace(text)
    if (ws === indent && text.slice(ws.length).startsWith('}')) return n
    if (ws.length < indent.length) return null
  }
  return null
}

/** last line of the contiguous run of blocks directly below `line`, or `line`
 * itself when there is none */
function contiguousBlocksEnd(doc: Text, line: number): number {
  let end = line
  let n = line + 1
  while (n <= doc.lines) {
    const text = doc.line(n).text
    if (!text.trim()) break
    let close: number | null = null
    if (OPENS_BLOCK_RE.test(text)) close = findBlockEnd(doc, n)
    else if (ONE_LINE_BLOCK_RE.test(text)) close = n
    if (close === null) break
    end = close
    n = close + 1
  }
  return end
}

/** turn `wrap foobar` + the blocks under it into `foobar <cursor> { …blocks… }`.
 * returns false when the cursor line is not a `wrap` line */
export const executeWrap: Command = (view) => {
  const { state } = view
  if (state.readOnly) return false
  const { doc } = state
  const line = doc.lineAt(state.selection.main.head)
  const match = WRAP_RE.exec(line.text)
  if (!match) return false
  const [, indent, word] = match as unknown as [string, string, string]
  const unit = state.facet(indentUnit)

  const end = contiguousBlocksEnd(doc, line.number)
  const body: string[] = []
  for (let n = line.number + 1; n <= end; n++) {
    const text = doc.line(n).text
    body.push(text.length ? unit + text : text)
  }

  const head = `${indent}${word} `
  const insert = head + ' {' + (body.length ? '\n' + body.join('\n') : '') + '\n' + indent + '}'
  view.dispatch({
    changes: { from: line.from, to: doc.line(end).to, insert },
    selection: { anchor: line.from + head.length },
    scrollIntoView: true,
    userEvent: 'input.wrap',
  })
  return true
}
