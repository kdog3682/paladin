// @paladin/codemirror-editor-experiment/keybindings/swapKeys.ts
import { EditorView } from '@codemirror/view'
import { Extension } from '@codemirror/state'

export function swapKeys(): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    let insert: string | null = null
    if (text === '4') insert = '$'
    else if (text === '$') insert = '4'
    if (!insert) return false

    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + 1 },
    })
    return true
  })
}
