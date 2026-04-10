// @paladin/codemirror-editor-experiment/keybindings/slashAutocomplete.ts
import { keymap, EditorView } from '@codemirror/view'
import {
  autocompletion,
  startCompletion,
  acceptCompletion,
  moveCompletionSelection,
  closeCompletion,
} from '@codemirror/autocomplete'
import type { CompletionContext, Completion } from '@codemirror/autocomplete'
import { Extension } from '@codemirror/state'

function isCamelOrPascal(w: string): boolean {
  return /[a-z][A-Z]/.test(w) || /^[A-Z][a-z]/.test(w)
}

function isSnakeOrScreaming(w: string): boolean {
  return /_/.test(w)
}

export function getWordCompletions(text: string): Completion[] {
  const words = text.match(/\b[a-zA-Z_][\w]*\b/g) || []
  const unique = [...new Set(words)]
  const filtered = unique.filter(w => isCamelOrPascal(w) || isSnakeOrScreaming(w))
  filtered.sort((a, b) => b.length - a.length)
  return filtered.map(label => ({ label }))
}

const PACKAGES: Completion[] = [
  '@paladin/ai',
  '@paladin/analyze-v2',
  '@paladin/api',
  '@paladin/bootstrap',
  '@paladin/claude-chat-downloader',
  '@paladin/codeform',
  '@paladin/codemirror-editor-experiment',
  '@paladin/docgen',
  '@paladin/fcache',
  '@paladin/json-viewer-backend',
  '@paladin/package-management',
  '@paladin/project-viewer-backend',
  '@paladin/project-viewer-frontend',
  '@paladin/scaffold',
  '@paladin/scaffold-v2',
  '@paladin/scaffold-v3',
  '@paladin/scribe-api',
  '@paladin/scribe-ui',
  '@paladin/storylite',
  '@paladin/tooling',
  '@paladin/types',
  '@paladin/utils',
  '@paladin/web',
].map(label => ({ label }))

function atSource(ctx: CompletionContext) {
  const word = ctx.matchBefore(/@[\w/-]*/)
  if (!word) return null
  return { from: word.from, options: PACKAGES, filter: true }
}

function slashSource(ctx: CompletionContext) {
  const word = ctx.matchBefore(/\/\w*/)
  if (!word) return null
  return {
    from: word.from + 1,
    options: getWordCompletions(ctx.state.doc.toString()),
    filter: true,
  }
}

export function slashAutocomplete(): Extension {
  return [
    autocompletion({
      override: [atSource, slashSource],
      activateOnTyping: false,
      defaultKeymap: false,
    }),
    keymap.of([
      { key: 'Tab', run: acceptCompletion },
      { key: 'ArrowDown', run: moveCompletionSelection(true) },
      { key: 'ArrowUp', run: moveCompletionSelection(false) },
      { key: 'Escape', run: closeCompletion },
    ]),
    EditorView.inputHandler.of((view, from, to, text) => {
      if (text === '-') {
        const line = view.state.doc.lineAt(from)
        if (from === line.from) {
          view.dispatch({
            changes: { from, to, insert: '- ' },
            selection: { anchor: from + 2 },
          })
          return true
        }
      }
      return false
    }),
    keymap.of([
      {
        key: 'Ctrl-/',
        run(view: EditorView) {
          const { state } = view
          const { head } = state.selection.main
          const line = state.doc.lineAt(head)
          const hasComment = line.text.startsWith('// ')
          if (hasComment) {
            view.dispatch({
              changes: { from: line.from, to: line.from + 3, insert: '' },
              selection: { anchor: line.from },
            })
          } else {
            view.dispatch({
              changes: { from: line.from, insert: '// ' },
              selection: { anchor: line.from + line.text.length + 3 },
            })
          }
          return true
        },
      },
    ]),
  ]
}
