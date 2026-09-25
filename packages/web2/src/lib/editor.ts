import type { EditorView } from '@codemirror/view'

/* "rename": focus and select the title input in the top bar */
export const focusTitle = () => {
  const input = document.querySelector<HTMLInputElement>('[data-note-title]')
  input?.focus()
  input?.select()
}

export const readDoc = (view: EditorView | null | undefined) => view?.state.doc.toString() ?? ''
