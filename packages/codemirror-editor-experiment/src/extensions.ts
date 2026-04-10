// @paladin/codemirror-editor-experiment/extensions.ts
import { EditorView, placeholder, keymap } from '@codemirror/view'
import { Extension } from '@codemirror/state'
import { indentOnInput, indentUnit, bracketMatching } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { theme } from './theme'
import { backtickHighlighter, headingHighlighter } from './decorations'
import { semicolonToColon } from './keybindings/semicolonToColon'
import { smartEnter } from './keybindings/smartEnter'
import { qChord } from './keybindings/qChord'
import { backslashContinue } from './keybindings/backslashContinue'
import { slashAutocomplete } from './keybindings/slashAutocomplete'
import { insertCodeBlock } from './keybindings/insertCodeBlock'
import { headingKey } from './keybindings/headingKey'
import { dashRule } from './keybindings/dashRule'
import { swapKeys } from './keybindings/swapKeys'
import { bracketNewline } from './keybindings/bracketNewline'

type SaveFn = (view: EditorView) => boolean

export function createExtensions(saveToStorage: SaveFn): Extension[] {
  return [
    theme,
    indentUnit.of('  '),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    keymap.of(closeBracketsKeymap),
    bracketNewline(),
    smartEnter(),
    keymap.of([indentWithTab]),
    semicolonToColon(),
    qChord(),
    backslashContinue(),
    slashAutocomplete(),
    placeholder('Start typing...'),
    EditorView.lineWrapping,
    history(),
    keymap.of(historyKeymap),
    headingHighlighter,
    backtickHighlighter,
    insertCodeBlock(),
    headingKey(),
    dashRule(),
    swapKeys(),
    keymap.of([{ key: 'Mod-s', run: saveToStorage }]),
  ]
}
