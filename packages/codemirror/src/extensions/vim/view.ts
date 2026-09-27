import { findClusterBreak, type EditorState } from '@codemirror/state'
import { Decoration, EditorView, showPanel, WidgetType, type DecorationSet, type Panel } from '@codemirror/view'
import { getVim, vimField, type VimState } from './state'

class EolBlock extends WidgetType {
  eq() {
    return true
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-vim-block cm-vim-block-eol'
    span.textContent = '\u00a0'
    return span
  }
}

const blockMark = Decoration.mark({ class: 'cm-vim-block' })
const eolBlock = Decoration.widget({ widget: new EolBlock(), side: 1 })

const buildBlocks = (state: EditorState): DecorationSet => {
  if (getVim(state)?.mode !== 'normal') return Decoration.none
  const ranges = state.selection.ranges.map(({ head }) => {
    const line = state.doc.lineAt(head)
    if (head >= line.to) return eolBlock.range(head)
    return blockMark.range(head, line.from + findClusterBreak(line.text, head - line.from))
  })
  return Decoration.set(ranges, true)
}

/** paints a block over the char under each cursor in normal mode */
export const blockCursor = EditorView.decorations.compute(['doc', 'selection', vimField], buildBlocks)

/** `cm-vim-normal` on the editor while in normal mode */
export const modeClass = EditorView.editorAttributes.from(vimField, s =>
  s.mode === 'normal' ? { class: 'cm-vim-normal' } : {},
)

const createPanel = (view: EditorView): Panel => {
  const dom = document.createElement('div')
  const render = (s: VimState) => {
    dom.className = s.prompt ? 'cm-vim-panel cm-vim-prompt' : 'cm-vim-panel cm-vim-message'
    dom.textContent = s.prompt ? (s.prompt.dir === 1 ? '/' : '?') + s.prompt.text : s.message ?? ''
  }
  render(view.state.field(vimField))
  return { dom, update: update => render(update.state.field(vimField)) }
}

/** bottom line showing the `/` prompt or a status message */
export const vimPanel = showPanel.from(vimField, s => (s.prompt || s.message ? createPanel : null))

export const vimTheme = EditorView.baseTheme({
  '&.cm-vim-normal .cm-cursorLayer': { display: 'none' },
  '&.cm-vim-normal .cm-content': { caretColor: 'transparent' },
  '.cm-vim-block': {
    backgroundColor: 'var(--vim-cursor, #90ee90)',
    // dark text keeps the char under the block readable in both themes
    color: '#0b2e0b',
  },
  '&:not(.cm-focused) .cm-vim-block': {
    backgroundColor: 'transparent',
    color: 'inherit',
    outline: '1px solid var(--vim-cursor, #90ee90)',
    outlineOffset: '-1px',
  },
  '.cm-vim-panel': { padding: '2px 8px', fontFamily: 'monospace', whiteSpace: 'pre' },
  '.cm-vim-message': { opacity: '0.7' },
  '.cm-vim-prompt::after': {
    content: '""',
    display: 'inline-block',
    width: '0.6em',
    height: '1.1em',
    verticalAlign: 'text-bottom',
    backgroundColor: 'currentColor',
    opacity: '0.6',
  },
})

