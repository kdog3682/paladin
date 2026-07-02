import { EditorView, keymap, drawSelection } from '@codemirror/view'
import { Extension } from '@codemirror/state'
import { indentOnInput, indentUnit, bracketMatching } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { search, searchKeymap } from '@codemirror/search'

export function native(): Extension[] {
  return [
    history(),
    search(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    indentUnit.of('  '),
    drawSelection({ cursorBlinkRate: 1400 }),
    EditorView.lineWrapping,
    keymap.of([
      ...closeBracketsKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab,
    ]),
  ]
}
