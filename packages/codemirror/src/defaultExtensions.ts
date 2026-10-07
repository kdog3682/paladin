import { Prec, type Extension } from '@codemirror/state'
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands'
import { search, searchKeymap } from '@codemirror/search'
import {
  bracketMatching,
  codeFolding,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
} from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { tabCompletion } from './extensions/autotab'
import { bracketIndent } from './extensions/bracketIndent'
import { exportTextBeneathCursor } from './extensions/exportText'
import { inoremap } from './extensions/inoremap'
import { baseInputRules, inputRules } from './extensions/inputRules'
import {
  executeCursorRight,
  executeJoinPrevious,
  executeNewlineDedent,
  executeNewlineIndent,
  executeWrapParens,
} from './extensions/qchord'
import { executeSmartEnter } from './extensions/smartEnter'
import { handleSmartPaste } from './extensions/smartPaste'
import { toggleIndentedBlockComment, toggleIndentedLineComment } from './extensions/toggleComment'
import { cycleWord, insertCommand, vim, type NormalCommands } from './extensions/vim'

const toggleBlockComment = toggleIndentedBlockComment()

/**
 * What every language gets: a vim normal mode on Esc (visual mode on `v`, whose
 * `w` wraps the selection in a named block), the punctuation, bracket and code input rules, the
 * `q`-leader insert chords, smart
 * enter, indent-aware comment toggling, export / cut below the cursor, and
 * reflowing paste.
 */
const editing = (vimCommands: NormalCommands = {}): Extension => [
  vim({
    commands: {
      'Space': cycleWord(),
      'Shift-Space': cycleWord({ dir: -1 }),
      'q w': insertCommand(executeNewlineIndent),
      'q e': insertCommand(executeNewlineDedent),
      ...vimCommands,
    },
  }),
  inputRules(baseInputRules),
  inoremap({
    'qw': executeNewlineIndent,
    'qe': executeNewlineDedent,
    'ql': executeCursorRight,
    'qd': executeJoinPrevious,
    'qp': executeWrapParens,
  }),
  Prec.high(keymap.of([
    { key: 'Enter', run: executeSmartEnter },
    { key: 'Mod-/', run: toggleIndentedLineComment() },
    { key: 'Mod-Shift-/', run: toggleBlockComment },
    { key: 'Mod-?', run: toggleBlockComment },
    { key: 'Mod-e', run: exportTextBeneathCursor({ includeCursorLine: true }) },
    { key: 'Mod-Shift-e', run: exportTextBeneathCursor({ includeCursorLine: true, delete: true }) },
  ])),
  EditorView.domEventHandlers({
    paste: handleSmartPaste({ maxWidth: 80 }),
  }),
]

export type DefaultExtensionOptions = {
  /** Extra normal-mode bindings merged over the defaults (null removes one). Hoist it to module scope. */
  vimCommands?: NormalCommands
  /** Line-number gutter. Defaults to false — wanted for code, not for prose. */
  lineNumbers?: boolean
  /** Fold arrows in the gutter. Folding itself is always on; this is just the UI. Defaults to false. */
  foldGutter?: boolean
  /** Tint the line the cursor is on, and its gutter entry. Defaults to false. */
  highlightActiveLine?: boolean
  /** String inserted per indent level. Defaults to two spaces. */
  indentUnit?: string
  /** Re-indent a line as its content makes the correct indentation clear. Defaults to true. */
  indentOnInput?: boolean
  /** Tab indents the line instead of moving focus. Defaults to true. */
  tabIndents?: boolean
  /** Undo/redo, with its keymap. Defaults to true. */
  history?: boolean
  /** Find/replace panel, with its keymap. Defaults to true. */
  search?: boolean
  /** Auto-close brackets and quotes, and highlight the matching one. Defaults to true. */
  brackets?: boolean
  /** Cursor blink interval in ms; 0 holds the cursor steady. Defaults to 1400. */
  cursorBlinkRate?: number
}

/**
 * The editing behaviour every document gets. Appearance is deliberately not
 * here — a theme comes from the language's appearance (see `./languages`), so
 * the same behaviour can be worn by a code look or a prose look.
 *
 * `codeFolding()` is unconditional because `stateFields` lists the fold field,
 * and a state can only deserialize fields its extensions provide.
 */
export function defaultExtensions(
  options: DefaultExtensionOptions = {}
): Extension[] {
  const {
    lineNumbers: showLineNumbers = false,
    foldGutter: showFoldGutter = false,
    highlightActiveLine: showActiveLine = false,
    indentUnit: indent = '  ',
    indentOnInput: reindent = true,
    tabIndents = true,
    history: undoRedo = true,
    search: find = true,
    brackets = true,
    cursorBlinkRate = 1400,
    vimCommands,
  } = options

  return [
    editing(vimCommands),
    Prec.highest(tabCompletion()),
    codeFolding(),
    indentUnit.of(indent),
    drawSelection({ cursorBlinkRate }),
    undoRedo ? history() : [],
    find ? search() : [],
    reindent ? indentOnInput() : [],
    brackets ? [closeBrackets(), bracketMatching(), bracketIndent()] : [],
    showLineNumbers ? lineNumbers() : [],
    showFoldGutter ? foldGutter() : [],
    showActiveLine
      ? [highlightActiveLine(), showLineNumbers ? highlightActiveLineGutter() : []]
      : [],
    keymap.of([
      ...(brackets ? closeBracketsKeymap : []),
      ...(find ? searchKeymap : []),
      ...(undoRedo ? historyKeymap : []),
      ...foldKeymap,
      ...(tabIndents ? [indentWithTab] : []),
      // last, so everything above wins a conflict
      ...defaultKeymap,
    ]),
  ]
}
