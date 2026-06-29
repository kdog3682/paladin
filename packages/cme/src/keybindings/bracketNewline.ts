// @paladin/codemirror-editor-experiment/keybindings/bracketNewline.ts
import { keymap } from '@codemirror/view'
import { Extension } from '@codemirror/state'
import type { EditorView, KeyBinding } from '@codemirror/view'

const INDENT = '  '

const PAIRS: Record<string, string> = {
  '{': '}',
  '[': ']',
  '(': ')',
}

const handleEnterBetweenBrackets: KeyBinding = {
  key: 'Enter',
  run(view: EditorView) {
    const { state } = view
    const { head } = state.selection.main

    if (head === 0) return false

    const before = state.doc.sliceString(head - 1, head)
    const after = state.doc.sliceString(head, head + 1)

    if (!PAIRS[before] || PAIRS[before] !== after) return false

    const line = state.doc.lineAt(head)
    const baseIndent = line.text.match(/^(\s*)/)?.[1] ?? ''
    const innerIndent = baseIndent + INDENT

    // \n + innerIndent (cursor line) + \n + baseIndent (closing bracket line)
    const insert = '\n' + innerIndent + '\n' + baseIndent

    view.dispatch({
      changes: { from: head, insert },
      selection: { anchor: head + 1 + innerIndent.length },
    })
    return true
  },
}

export function bracketNewline(): Extension {
  return keymap.of([handleEnterBetweenBrackets])
}
