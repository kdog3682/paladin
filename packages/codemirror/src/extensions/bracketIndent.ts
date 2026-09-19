import { EditorState, Prec, type Extension } from '@codemirror/state'
import { indentService, language } from '@codemirror/language'

const OPENER = /[(\[{]\s*$/
const CLOSER = /^\s*[)\]}]/

/**
 * Bracket-driven indentation for documents with no parser. A line indents one
 * unit past the previous non-blank line when that line ends in an opener, and
 * otherwise copies it. A line that starts with a closer sits level with the
 * line that opened it, so pressing Enter between a pair opens it up and typing
 * a closer re-aligns it.
 *
 * Yields to a language's own indentation: it does nothing once a language is
 * installed, and sits at the lowest precedence regardless.
 */
export function bracketIndent(): Extension {
  return [
    Prec.lowest(
      indentService.of((cx, pos) => {
        if (cx.state.facet(language)) return null
        const { doc } = cx.state
        const line = doc.lineAt(pos)
        const before = doc.sliceString(line.from, pos)

        // a break mid-line continues from the text before it, otherwise from the line above
        let prevText: string
        let prevFrom: number
        if (/\S/.test(before)) {
          prevText = before
          prevFrom = line.from
        } else {
          let n = line.number - 1
          while (n > 0 && !/\S/.test(doc.line(n).text)) n--
          if (n < 1) return 0
          prevText = doc.line(n).text
          prevFrom = doc.line(n).from
        }

        let indent = cx.lineIndent(prevFrom)
        if (OPENER.test(prevText)) indent += cx.unit
        if (CLOSER.test(cx.textAfterPos(pos))) indent -= cx.unit
        return Math.max(0, indent)
      })
    ),
    // lets indentOnInput re-align a line as soon as a closer is typed at its start
    EditorState.languageData.of(() => [{ indentOnInput: /^\s*[)\]}]$/ }]),
  ]
}
