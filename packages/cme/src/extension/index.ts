import { EditorView, placeholder, keymap, drawSelection } from '@codemirror/view'
import { Extension } from '@codemirror/state'
import { indentOnInput, indentUnit, bracketMatching } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { search, searchKeymap } from '@codemirror/search'
import { theme } from './theme'
import { syntaxHighlighter } from './decorations'
import {
  smartEnter,
  heading,
  toggleComment,
  insertCodeBlock,
  bracketOnNine,
  tabCompletion,
  dashRule,
  swapKeys,
  sectionFold,
  toggleSectionFold,
  initialFoldsFacet,
  foldsFacet,
  executeNewlineIndent,
  executeNewlineDedent,
  executeCursorRight,
  executeNewline,
  inoremap,
} from '../keybindings'

function native(placeholderText: string): Extension[] {
  return [
    history(),
    search(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    indentUnit.of('  '),
    drawSelection({ cursorBlinkRate: 1400 }),
    placeholder(placeholderText),
    EditorView.lineWrapping,
    keymap.of([
      ...closeBracketsKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab,
    ]),
  ]
}

export { foldsFacet }

type SaveFn = (view: EditorView) => boolean

export function createExtensions(
  saveToStorage: SaveFn,
  savedFolds: string[] = [],
  placeholderText = 'Start typing...',
): Extension[] {
  return [
    initialFoldsFacet.of(savedFolds),
    theme,
    tabCompletion(),
    ...native(placeholderText),
    keymap.of([
      { key: 'Enter', run: smartEnter },
      { key: '`', run: insertCodeBlock },
      { key: '#', run: heading },
      { key: '9', run: bracketOnNine },
      { key: 'Mod-/', run: toggleComment },
      { key: 'Mod-s', run: saveToStorage },
    ]),
    inoremap({
      'qw': executeNewlineIndent,
      'qe': executeNewlineDedent,
      'ql': executeCursorRight,
      'qo': executeNewline,
      'zf': toggleSectionFold,
    }),
    syntaxHighlighter,
    dashRule(),
    swapKeys(),
    sectionFold(),
  ]
}
