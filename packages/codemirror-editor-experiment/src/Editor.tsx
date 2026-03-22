// @paladin/codemirror-editor-experiment/Editor.tsx
import { useRef, useEffect, useCallback } from 'react'
import { EditorView, placeholder } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { closeBrackets } from '@codemirror/autocomplete'
import { yaml } from '@codemirror/lang-yaml'
import { Button } from '@bklearn/shadcn'
import { Copy, Trash2, ClipboardCopy } from 'lucide-react'
import { semicolonToColon } from './keybindings/semicolonToColon'
import { smartEnter } from './keybindings/smartEnter'
import { qSequence } from './keybindings/qSequence'
import { backslashContinue } from './keybindings/backslashContinue'
import { slashAutocomplete } from './keybindings/slashAutocomplete'

const theme = EditorView.theme({
  '&': {
    fontSize: '14px',
    fontFamily: "'Inconsolata', monospace",
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
    overflow: 'hidden',
  },
  '&.cm-focused': {
    outline: 'none',
    borderColor: '#94a3b8',
    boxShadow: '0 0 0 3px rgba(148, 163, 184, 0.15)',
  },
  '.cm-content': {
    padding: '16px 20px',
    caretColor: '#334155',
    lineHeight: '1.6',
  },
  '.cm-line': {
    padding: '0',
  },
  '.cm-cursor': {
    borderLeftColor: '#334155',
    borderLeftWidth: '2px',
  },
  '.cm-selectionBackground': {
    backgroundColor: '#dbeafe !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: '#bfdbfe !important',
  },
  '.cm-placeholder': {
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  '.cm-scroller': {
    overflow: 'auto',
    minHeight: '200px',
    maxHeight: '70vh',
  },
  '.cm-tooltip-autocomplete': {
    fontFamily: "'Inconsolata', monospace",
    fontSize: '13px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
  },
  '.cm-tooltip-autocomplete ul li': {
    padding: '4px 12px',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: '#eff6ff',
    color: '#1e40af',
  },
})

const extensions = [
  theme,
  yaml(),
  closeBrackets(),
  semicolonToColon(),
  smartEnter(),
  qSequence(),
  backslashContinue(),
  slashAutocomplete(),
  placeholder('Start typing...'),
  EditorView.lineWrapping,
]

export function Editor() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const view = new EditorView({
      state: EditorState.create({ extensions }),
      parent: containerRef.current,
    })
    viewRef.current = view
    view.focus()

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  const getContent = useCallback(() => {
    return viewRef.current?.state.doc.toString() ?? ''
  }, [])

  const handleCopy = useCallback(async () => {
    const text = getContent()
    await navigator.clipboard.writeText(text)
  }, [getContent])

  const handleClear = useCallback(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: '' },
    })
    view.focus()
  }, [])

  const handleCopyAndClear = useCallback(async () => {
    await handleCopy()
    handleClear()
  }, [handleCopy, handleClear])

  return (
    <div className="flex flex-col gap-3 w-full max-w-3xl mx-auto">
      <div ref={containerRef} />
      <div className="flex items-center gap-2 justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="gap-1.5 text-slate-600"
        >
          <Copy className="size-3.5" />
          Copy
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClear}
          className="gap-1.5 text-slate-600"
        >
          <Trash2 className="size-3.5" />
          Clear
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyAndClear}
          className="gap-1.5 text-slate-600"
        >
          <ClipboardCopy className="size-3.5" />
          Copy & Clear
        </Button>
      </div>
    </div>
  )
}
