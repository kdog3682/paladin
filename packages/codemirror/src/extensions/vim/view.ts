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
  const mode = getVim(state)?.mode
  if (mode !== 'normal' && mode !== 'visual') return Decoration.none
  // a non-empty range is drawn by the selection layer instead. in visual mode only an
  // empty one is left, ie `v` on a blank line, and it still needs something to show
  const ranges = state.selection.ranges.filter(range => range.empty).map(({ head }) => {
    const line = state.doc.lineAt(head)
    if (head >= line.to) return eolBlock.range(head)
    return blockMark.range(head, line.from + findClusterBreak(line.text, head - line.from))
  })
  return Decoration.set(ranges, true)
}

/** paints a block over the char under each bare cursor in normal and visual mode */
export const blockCursor = EditorView.decorations.compute(['doc', 'selection', vimField], buildBlocks)

/** `cm-vim-normal` / `cm-vim-visual` on the editor while in that mode */
export const modeClass = EditorView.editorAttributes.from(vimField, s =>
  s.mode === 'insert' ? {} : { class: `cm-vim-${s.mode}` },
)

/** what the panel is showing, in priority order: a prompt, a message, then the mode itself */
const panelText = (s: VimState) => {
  if (s.prompt) return s.prompt.label + s.prompt.text
  if (s.message) return s.message
  if (s.mode !== 'visual') return ''
  return s.visualLine ? '-- VISUAL LINE --' : '-- VISUAL --'
}

const createPanel = (view: EditorView): Panel => {
  const dom = document.createElement('div')
  const render = (s: VimState) => {
    dom.className = s.prompt ? 'cm-vim-panel cm-vim-prompt' : 'cm-vim-panel cm-vim-message'
    dom.textContent = panelText(s)
  }
  render(view.state.field(vimField))
  return { dom, update: update => render(update.state.field(vimField)) }
}

/** bottom line showing the prompt, a status message, or `-- VISUAL --` */
export const vimPanel = showPanel.from(vimField, s =>
  s.prompt || s.message || s.mode === 'visual' ? createPanel : null,
)

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
  // the language appearances set `.cm-selectionBackground` with !important (see
  // txflow's theme), which a base theme loses to on equal weight, so match it
  '&.cm-vim-visual .cm-selectionBackground': {
    backgroundColor: 'var(--vim-visual, #ffd966) !important',
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

