// @paladin/codemirror-editor-experiment/keybindings/pasteCodeWrap.ts
import { EditorView } from '@codemirror/view'
import { Extension } from '@codemirror/state'

function looksLikeCode(text: string): boolean {
  if (!text.includes('\n')) return false

  const lines = text.split('\n')

  // indented block (2+ spaces or tab on multiple lines)
  const indentedLines = lines.filter(l => /^(\s{2,}|\t)/.test(l))
  if (indentedLines.length >= 2) return true

  // common code punctuation density
  const codeChars = (text.match(/[{}();=><[\]]/g) ?? []).length
  if (codeChars / text.length > 0.04) return true

  // keywords
  if (/\b(function|const|let|var|return|import|export|class|def|if|else|for|while)\b/.test(text)) return true

  return false
}

export function pasteCodeWrap(): Extension {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const text = event.clipboardData?.getData('text/plain')
      if (!text || !looksLikeCode(text)) return false

      event.preventDefault()

      const { from, to } = view.state.selection.main

      })

      return true
    },
  })
}
