import { type ChangeSpec, EditorSelection, type Line, type Text } from '@codemirror/state'
import { type Command } from '@codemirror/view'
import { contextIndent, leadingWhitespace, minIndent, selectedLines } from './lineUtils'

export type CommentTokens = {
  /* line comment token */
  line: string
  /* block comment delimiters, each placed on its own line */
  block: { open: string, close: string }
}

export const DEFAULT_COMMENT_TOKENS: CommentTokens = {
  line: '//',
  block: { open: '/*', close: '*/' },
}

/** toggle `// ` on every selected line. comments are inserted at the shallowest
 * indent of the selection so the block stays aligned */
export function toggleIndentedLineComment(tokens: CommentTokens = DEFAULT_COMMENT_TOKENS): Command {
  const token = tokens.line
  return (view) => {
    const { state } = view
    if (state.readOnly) return false
    const byNumber = new Map<number, Line>()
    for (const range of state.selection.ranges) {
      for (const line of selectedLines(state.doc, range)) byNumber.set(line.number, line)
    }
    const lines = [...byNumber.values()].sort((a, b) => a.number - b.number)
    const nonBlank = lines.filter((l) => l.text.trim())
    const bodyOf = (l: Line) => l.text.slice(leadingWhitespace(l.text).length)
    const changes: ChangeSpec[] = []

    if (nonBlank.length && nonBlank.every((l) => bodyOf(l).startsWith(token))) {
      for (const l of nonBlank) {
        const at = l.from + leadingWhitespace(l.text).length
        const space = l.text[at - l.from + token.length] === ' ' ? 1 : 0
        changes.push({ from: at, to: at + token.length + space })
      }
    } else if (nonBlank.length) {
      const col = minIndent(nonBlank).length
      for (const l of nonBlank) changes.push({ from: l.from + col, insert: token + ' ' })
    } else {
      // only blank lines selected: comment at the surrounding indent
      for (const l of lines) {
        const indent = contextIndent(state.doc, l)
        changes.push({ from: l.from, to: l.to, insert: indent + token + ' ' })
      }
    }

    view.dispatch({ changes, scrollIntoView: true, userEvent: 'comment.line' })
    return true
  }
}

/** delete [from, to) together with one adjacent newline */
function removeWithNewline(doc: Text, from: number, to: number): ChangeSpec {
  if (to < doc.length) return { from, to: to + 1 }
  return { from: Math.max(0, from - 1), to }
}

/** the `/*` and `*\/` lines wrapping the selection, either the selected edge
 * lines themselves or the lines directly around them */
function delimitersAround(doc: Text, first: Line, last: Line, block: CommentTokens['block']): [Line, Line] | null {
  if (last.number > first.number && first.text.trim() === block.open && last.text.trim() === block.close) {
    return [first, last]
  }
  if (first.number > 1 && last.number < doc.lines) {
    const above = doc.line(first.number - 1)
    const below = doc.line(last.number + 1)
    if (above.text.trim() === block.open && below.text.trim() === block.close) return [above, below]
  }
  return null
}

/** toggle a block comment with the delimiters on their own lines at the
 * selection's indent. on an empty line it inserts
 *
 *   /*
 *   <cursor>
 *   *\/
 */
export function toggleIndentedBlockComment(tokens: CommentTokens = DEFAULT_COMMENT_TOKENS): Command {
  const { open, close } = tokens.block
  return (view) => {
    const { state } = view
    if (state.readOnly) return false
    const { doc } = state
    const tr = state.changeByRange((range) => {
      const lines = selectedLines(doc, range)
      const first = lines[0]!
      const last = lines[lines.length - 1]!

      const pair = delimitersAround(doc, first, last, tokens.block)
      if (pair) {
        const [o, c] = pair
        const changes = state.changes(
          c.number === o.number + 1
            ? removeWithNewline(doc, o.from, c.to)
            : [removeWithNewline(doc, o.from, o.to), removeWithNewline(doc, c.from, c.to)],
        )
        return { changes, range: range.map(changes) }
      }

      if (range.empty && !first.text.trim()) {
        const indent = contextIndent(doc, first)
        const insert = `${indent}${open}\n${indent}\n${indent}${close}`
        return {
          changes: { from: first.from, to: first.to, insert },
          range: EditorSelection.cursor(first.from + indent.length + open.length + 1 + indent.length),
        }
      }

      const indent = minIndent(lines)
      const head = indent + open + '\n'
      return {
        changes: [{ from: first.from, insert: head }, { from: last.to, insert: '\n' + indent + close }],
        range: EditorSelection.range(range.anchor + head.length, range.head + head.length),
      }
    })
    view.dispatch({ ...tr, scrollIntoView: true, userEvent: 'comment.block' })
    return true
  }
}
