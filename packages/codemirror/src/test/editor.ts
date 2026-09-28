import { EditorSelection, EditorState } from '@codemirror/state'
import type { Extension, SelectionRange, TransactionSpec } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

/**
 * Test helpers for describing editor state as a string.
 *
 * A *spec* is a document with the selection written inline: `'|'` is a cursor
 * and `'«…»'` a selection. Several of each are allowed.
 */

/** Build a state from a spec: `'foo|'`, `'«foo»'`, `'a|b|'`. */
export function parse(spec: string, extensions: Extension[] = []): EditorState {
  let doc = ''
  const ranges: SelectionRange[] = []
  let anchor = 0
  for (const c of spec) {
    if (c === '|') ranges.push(EditorSelection.cursor(doc.length))
    else if (c === '«') anchor = doc.length
    else if (c === '»') ranges.push(EditorSelection.range(anchor, doc.length))
    else doc += c
  }
  return EditorState.create({
    doc,
    selection: ranges.length ? EditorSelection.create(ranges, 0) : EditorSelection.single(0),
    // without this, EditorState.create collapses the selection to its main range
    extensions: [EditorState.allowMultipleSelections.of(true), ...extensions],
  })
}

/** The inverse of {@link parse}: write the selection back into the document. */
export function render(state: EditorState): string {
  const marks: { pos: number, text: string }[] = []
  for (const range of state.selection.ranges) {
    if (range.empty) marks.push({ pos: range.from, text: '|' })
    else {
      marks.push({ pos: range.from, text: '«' })
      marks.push({ pos: range.to, text: '»' })
    }
  }
  marks.sort((a, b) => b.pos - a.pos)
  let doc = state.doc.toString()
  for (const mark of marks) doc = doc.slice(0, mark.pos) + mark.text + doc.slice(mark.pos)
  return doc
}

/**
 * The smallest thing that passes for an `EditorView`: a mutable `state` and a
 * `dispatch` that applies transactions to it. Enough for any command that only
 * reads `view.state` and dispatches.
 */
export function mockView(state: EditorState): EditorView {
  const view = {
    state,
    dispatch(...specs: TransactionSpec[]) {
      view.state = view.state.update(...specs).state
    },
  }
  return view as unknown as EditorView
}

/** Run a view command against a spec and render the result. */
export function runCommand(spec: string, command: (view: EditorView) => unknown): string {
  const view = mockView(parse(spec))
  command(view)
  return render(view.state)
}
