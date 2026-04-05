// @paladin/codemirror-editor-experiment/theme.ts
import { EditorView } from '@codemirror/view'

export const theme = EditorView.theme({
  '&': {
    fontSize: '15px',
    fontFamily: "'Inconsolata', monospace",
    backgroundColor: 'transparent',
    color: '#1f2937',
    height: '100%',
    width: '100%',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-content': {
    padding: '36px 40px',
    caretColor: '#0f172a',
    lineHeight: '1.45 !important',
    color: '#1f2937',
  },
  '.cm-line': {
    lineHeight: '1.45 !important',
    padding: '0',
  },
  '.cm-cursor': {
    borderLeftColor: '#0f172a',
    borderLeftWidth: '2px',
  },
  '.cm-selectionBackground': {
    backgroundColor: '#c7e3ff !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: '#afd7ff !important',
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
    fontSize: '14px',
    borderRadius: '10px',
    border: '1px solid #dbe7f5',
    boxShadow: '0 12px 30px rgba(30, 41, 59, 0.12)',
  },
  '.cm-tooltip-autocomplete ul li': {
    padding: '6px 14px',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: '#e6f3ff',
    color: '#1e3a8a',
  },
  '.cm-backtick-block': {
    color: '#0284c7',
  },
  '.cm-heading-line': {
    color: '#0f172a',
  },
  '.cm-heading-hash': {
    backgroundColor: '#0f172a',
    borderRadius: '2px',
  },
  '.cm-angle-bracket': {
    color: '#0f766e',
  },
  '.cm-dim': {
    color: '#64748b',
  },
})
