import { type Command } from '@codemirror/view'

export type ExportTextBeneathCursorOpts = {
  /* start the export at the cursor's line instead of the line after it */
  includeCursorLine?: boolean
  /* remove the exported text from the doc once it has been written */
  delete?: boolean
  /* where the text goes, defaults to the clipboard */
  write?: (text: string) => void | Promise<void>
}

const writeClipboard = (text: string) => navigator.clipboard.writeText(text)

/** export everything from the cursor's line (or the line after it) to the end
 * of the doc. with `delete`, the text is only removed after the write succeeds
 * and only if the doc hasn't changed in the meantime */
export function exportTextBeneathCursor(opts: ExportTextBeneathCursorOpts = {}): Command {
  const write = opts.write ?? writeClipboard
  return (view) => {
    const { state } = view
    const { doc } = state
    const line = doc.lineAt(state.selection.main.head)
    const from = opts.includeCursorLine ? line.from : Math.min(line.to + 1, doc.length)
    const text = doc.sliceString(from, doc.length)
    if (!text) return false
    if (opts.delete && state.readOnly) return false

    void Promise.resolve(write(text)).then(() => {
      if (!opts.delete || view.state.doc !== doc) return
      // take the newline before the export with it so no empty line is left behind
      const cut = from > 0 ? from - 1 : from
      view.dispatch({
        changes: { from: cut, to: doc.length },
        selection: { anchor: cut },
        scrollIntoView: true,
        userEvent: 'delete.cut',
      })
    })
    return true
  }
}
