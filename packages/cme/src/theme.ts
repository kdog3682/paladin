// @paladin/codemirror-editor-experiment/theme.ts
import { EditorView } from '@codemirror/view'

export const theme = EditorView.theme({
  '&': {
    fontSize: '14px',
    fontFamily: "'Inconsolata', monospace",
    backgroundColor: '#ffffff',
    color: '#000000',
    height: '100vh',
    width: '100vw',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-content': {
    padding: '40px 48px',
    caretColor: '#000000',
    lineHeight: '1.35 !important',
    color: '#000000',
  },
  '.cm-line': {
    lineHeight: '1.35 !important',
    padding: '0',
  },
  '.cm-cursor': {
    borderLeftColor: '#000000',
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
    height: '100%',
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
  '.cm-backtick-block': {
    color: '#3b82f6',
  },
  '.cm-heading-line': {
    color: '#000000',
  },
  '.cm-heading-hash': {
    backgroundColor: '#000000',
    borderRadius: '2px',
  },
  '.cm-angle-bracket': {
    color: '#16a34a',
  },
  '.cm-dim': {
    color: '#94a3b8',
  },
  '.cm-bold': {
    fontWeight: 'bold',
  },
})
