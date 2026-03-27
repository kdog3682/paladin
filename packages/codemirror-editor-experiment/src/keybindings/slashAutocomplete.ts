// @paladin/codemirror-editor-experiment/keybindings/slashAutocomplete.ts
import { keymap } from '@codemirror/view'
import {
  autocompletion,
  startCompletion,
} from '@codemirror/autocomplete'
import type { CompletionContext, Completion } from '@codemirror/autocomplete'
import { Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

const MIN_WORD_LENGTH = 5

export function getWordCompletions(text: string): Completion[] {
  const words = text.match(/\b[a-zA-Z_][\w]*\b/g) || []
  const unique = [...new Set(words.filter(w => w.length >= MIN_WORD_LENGTH))]
  return unique.map(label => ({ label }))
}

function wordSource(ctx: CompletionContext) {
  const word = ctx.matchBefore(/\w*/)
  if (!word) return null
  return {
    from: word.from,
    options: getWordCompletions(ctx.state.doc.toString()),
    filter: true,
  }
}

export function slashAutocomplete(): Extension {
  return [
    autocompletion({
      override: [wordSource],
      activateOnTyping: false,
    }),
    keymap.of([{
      key: '/',
      run(view: EditorView) {
        const { state } = view
        const { head } = state.selection.main
        const line = state.doc.lineAt(head)
        if (head === line.from) {
          view.dispatch({
            changes: { from: head, insert: '// ' },
            selection: { anchor: head + 3 },
          })
          return true
        }
        startCompletion(view)
        return true
      },
    }]),
  ]
}
