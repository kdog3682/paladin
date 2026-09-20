import type { EditorView } from '@codemirror/view'

/* "rename": the title is line 1, so select it and let the user type over it */
export const focusTitle = (view: EditorView | null | undefined) => {
  if (!view) return
  const line = view.state.doc.line(1)
  view.dispatch({ selection: { anchor: line.from, head: line.to }, scrollIntoView: true })
  view.focus()
}

export const readDoc = (view: EditorView | null | undefined) => view?.state.doc.toString() ?? ''
