import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  keymap,
} from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { foldGutter, foldKeymap, indentOnInput, bracketMatching } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'

// CM6 has no native block caret — hide the thin native one and draw a block via theme instead
const vimBlockCursor = EditorView.theme({
  '.cm-content': { caretColor: 'transparent' },
  '.cm-cursor, .cm-dropCursor': {
    borderLeft: 'none',
    width: '0.6em',
    backgroundColor: 'rgba(120,120,120,0.6)',
  },
})

// trimmed, hand-picked replacement for codemirror's `basicSetup` bundle
export const basicSetup: Extension = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightActiveLine(),
  history(),
  foldGutter(),
  drawSelection(),
  indentOnInput(),
  bracketMatching(),
  closeBrackets(),
  highlightSelectionMatches(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    indentWithTab,
  ]),
  vimBlockCursor,
]
