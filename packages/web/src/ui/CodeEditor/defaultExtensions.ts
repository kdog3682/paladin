import { type Extension } from '@codemirror/state'
import { EditorView, drawSelection, keymap } from '@codemirror/view'
import {
  history,
  historyField,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands'
import { search, searchKeymap } from '@codemirror/search'
import {
  bracketMatching,
  codeFolding,
  foldState,
  indentOnInput,
  indentUnit,
} from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import {DEFAULT_THEME} from "./defaultTheme.ts"
// folded into the JSON snapshot alongside doc + selection
// export const stateFields = { history: historyField, folds: foldState }
export const stateFields = {folds: foldState}

export const defaultExtensions: Extension[] = [
  history(),
  search(),
  indentOnInput(),
  bracketMatching(),
  closeBrackets(),
  codeFolding(), // makes fold state serializable
  indentUnit.of('  '),
  drawSelection({ cursorBlinkRate: 1400 }),
  keymap.of([
    ...closeBracketsKeymap,
    ...historyKeymap,
    ...searchKeymap,
    indentWithTab,
  ]),
  DEFAULT_THEME,
]
