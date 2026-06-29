// @paladin/codemirror-editor-experiment/extensions.ts
import { EditorView, placeholder, keymap, drawSelection } from '@codemirror/view'
import { Extension } from '@codemirror/state'
import { indentOnInput, indentUnit, bracketMatching } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { theme } from './theme'
import { backtickHighlighter, headingHighlighter, miscHighlighter } from './decorations'
import { smartEnter } from './keybindings/smartEnter'
import { qChord } from './keybindings/qChord'
import { backslashContinue } from './keybindings/backslashContinue'
// import { slashAutocomplete } from './keybindings/slashAutocomplete'
import { tabCompletion } from './keybindings/tabCompletion'
import { insertCodeBlock } from './keybindings/insertCodeBlock'
import { headingKey } from './keybindings/headingKey'
import { dashRule } from './keybindings/dashRule'
import { swapKeys } from './keybindings/swapKeys'
import { bracketOnNine } from './keybindings/bracketOnNine'
import { toggleComment } from './keybindings/toggleComment'
import { sectionFold } from './keybindings/sectionFold'
import { bracketNewline } from './keybindings/bracketNewline'
// import { pasteCodeWidget } from './keybindings/pasteCodeWidget'
import { pasteCodeWrap } from './keybindings/pasteCodeWrap'
import { angleBracket } from './keybindings/angleBracket'
import { bold } from './keybindings/bold'
import { search, searchKeymap } from '@codemirror/search'

type SaveFn = (view: EditorView) => boolean

export function createExtensions(saveToStorage: SaveFn): Extension[] {
  return [
    theme,
    drawSelection({ cursorBlinkRate: 1400 }),
    indentUnit.of('  '),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    keymap.of(closeBracketsKeymap),
    bracketNewline(),
    smartEnter(),
    tabCompletion(),
    keymap.of([indentWithTab]),
    qChord(),
    backslashContinue(),
    // slashAutocomplete(),
    placeholder('Start typing...'),
    EditorView.lineWrapping,
    history(),
    keymap.of(historyKeymap),
    headingHighlighter,
    backtickHighlighter,
    miscHighlighter,
    insertCodeBlock(),
    // pasteCodeWidget(),
    // pasteCodeWrap(),
    angleBracket(),
    headingKey(),
    dashRule(),
    swapKeys(),
    bracketOnNine(),
    toggleComment(),
    bold(),
    sectionFold(),
    keymap.of([{ key: 'Mod-s', run: saveToStorage }]),
    search(),
    keymap.of(searchKeymap),
  ]
}
