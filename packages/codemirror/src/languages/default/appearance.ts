import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

const color = {
  fg: '#1f2328',
  muted: '#8b949e',
  selection: '#dbeafe',
  selectionFocused: '#bfdbfe',
  comment: '#6e7781',
  keyword: '#8250df',
  string: '#0a3069',
  number: '#0550ae',
  name: '#953800',
  type: '#0550ae',
}

const theme = EditorView.theme({
  '&': {
    backgroundColor: '#ffffff',
    color: color.fg,
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': {
    padding: '16px 0',
  },
  '.cm-gutters': {
    backgroundColor: '#ffffff',
    color: color.muted,
    border: 'none',
  },
  '.cm-cursor': {
    borderLeftColor: color.fg,
    borderLeftWidth: '2px',
  },
  '.cm-selectionBackground': {
    backgroundColor: `${color.selection} !important`,
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: `${color.selectionFocused} !important`,
  },
  '.cm-placeholder': { color: color.muted },
})

const highlight = HighlightStyle.define([
  { tag: t.comment, color: color.comment, fontStyle: 'italic' },
  { tag: [t.keyword, t.modifier, t.operatorKeyword], color: color.keyword },
  { tag: [t.string, t.special(t.string)], color: color.string },
  { tag: [t.number, t.bool, t.null], color: color.number },
  { tag: [t.function(t.variableName), t.labelName], color: color.name },
  { tag: [t.typeName, t.className, t.definition(t.typeName)], color: color.type },
  { tag: t.invalid, color: '#cf222e' },
])

/** The look standard code languages get unless their spec overrides it. */
export const DEFAULT_APPEARANCE = [theme, syntaxHighlighting(highlight)]
