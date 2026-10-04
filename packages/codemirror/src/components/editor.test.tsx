import { afterEach, describe, expect, mock, test } from 'bun:test'
import { cleanup, render } from '@testing-library/react'
import { foldEffect } from '@codemirror/language'
import type { EditorView } from '@codemirror/view'
import { Editor, type EditorProps } from './editor'
import { FONT_STACKS } from '../fonts'
import type { LanguageMap } from '../languages'
import { serializeEditorState } from '../state'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const LANGUAGES: LanguageMap = {
  // wrapLines differs between the two so a file switch can't quietly lose it
  flat: { wrapLines: false, placeholder: 'flat' },
  prose: { wrapLines: true, placeholder: 'prose' },
  scripty: { placeholder: 'scripty' },
}

const DEBOUNCE = 10
const tick = (ms = DEBOUNCE + 10) => new Promise((r) => setTimeout(r, ms))

type Handle = {
  view: EditorView
  update: (next: Partial<EditorProps>) => void
  unmount: () => void
  container: HTMLElement
}

function mount(initial: Partial<EditorProps> = {}): Handle {
  const captured: { view: EditorView | null } = { view: null }
  let props: EditorProps = {
    fileId: 'a.txt',
    language: 'prose',
    languages: LANGUAGES,
    onSaveDebounceDelay: DEBOUNCE,
    ...initial,
  }
  const ui = () => (
    <Editor
      {...props}
      onViewReady={(v) => {
        captured.view = v
        initial.onViewReady?.(v)
      }}
    />
  )
  const r = render(ui())
  return {
    get view() {
      return captured.view!
    },
    update(next) {
      props = { ...props, ...next }
      r.rerender(ui())
    },
    unmount: r.unmount,
    container: r.container,
  }
}

/** Types at the end of the doc, which is what drives the updateListener. */
function type(view: EditorView, text: string) {
  view.dispatch({
    changes: { from: view.state.doc.length, insert: text },
  })
}

describe('mounting', () => {
  test('starts empty when no state is given', () => {
    const h = mount()
    expect(h.view.state.doc.toString()).toBe('')
  })

  test('loads the doc and selection from a snapshot', () => {
    const h = mount({
      state: {
        doc: 'hello\nworld',
        selection: { main: 0, ranges: [{ anchor: 3, head: 3 }] },
      },
    })
    expect(h.view.state.doc.toString()).toBe('hello\nworld')
    expect(h.view.state.selection.main.head).toBe(3)
  })

  test('accepts a doc-only snapshot, with the cursor at the start', () => {
    const h = mount({ state: { doc: 'seeded from plain text' } })
    expect(h.view.state.doc.toString()).toBe('seeded from plain text')
    expect(h.view.state.selection.main.head).toBe(0)
  })

  test('applies the language placeholder and wrap setting', () => {
    const h = mount({ language: 'prose' })
    expect(h.container.querySelector('.cm-lineWrapping')).not.toBeNull()
    expect(h.container.textContent).toContain('prose')
  })

  test('an unknown language key falls back rather than throwing', () => {
    const h = mount({ language: 'nope' })
    expect(h.view.state.doc.toString()).toBe('')
    expect(h.container.textContent).toContain('start typing in nope')
  })
})

const unquoted = (family: string) => family.replace(/["']/g, '').trim()

/** The family the editor is actually rendering its text in. Quotes are stripped: computed style may swap or drop them. */
function fontOf(h: Handle) {
  const scroller = h.container.querySelector('.cm-scroller') as HTMLElement
  return unquoted(getComputedStyle(scroller).fontFamily)
}

const stack = (key: keyof typeof FONT_STACKS) => unquoted(FONT_STACKS[key])

describe('font selection', () => {
  test('defaults to inconsolata', () => {
    const h = mount()
    expect(fontOf(h)).toBe(stack('inconsolata'))
  })

  test('applies to every language', () => {
    const h = mount({ language: 'scripty', font: 'ncm-mono' })
    expect(fontOf(h)).toBe(stack('ncm-mono'))
    h.update({ language: 'prose' })
    expect(fontOf(h)).toBe(stack('ncm-mono'))
  })

  test('switches without remounting the view', () => {
    const h = mount({ font: 'inconsolata' })
    const before = h.view

    h.update({ font: 'ncm-mono' })

    expect(fontOf(h)).toBe(stack('ncm-mono'))
    expect(h.view).toBe(before)
  })

  test('survives a file switch', () => {
    const h = mount({ fileId: 'a.txt', font: 'ncm-mono' })
    h.update({ fileId: 'b.txt' })
    expect(fontOf(h)).toBe(stack('ncm-mono'))
  })
})

describe('serialization', () => {
  test('round-trips doc, selection and folds through a snapshot', () => {
    const first = mount({ state: { doc: 'one\ntwo\nthree\nfour' } })
    first.view.dispatch({
      selection: { anchor: 4, head: 7 },
      effects: foldEffect.of({ from: 8, to: 17 }),
    })

    const snapshot = serializeEditorState(first.view)
    expect(snapshot.doc).toBe('one\ntwo\nthree\nfour')
    expect(snapshot.selection?.ranges[0]).toEqual({ anchor: 4, head: 7 })
    expect(snapshot.folds).toEqual([8, 17])

    first.unmount()

    const second = mount({ state: snapshot })
    expect(second.view.state.doc.toString()).toBe('one\ntwo\nthree\nfour')
    expect(second.view.state.selection.main.anchor).toBe(4)
    expect(serializeEditorState(second.view).folds).toEqual([8, 17])
  })
})

describe('saving', () => {
  test('debounces, then reports the doc and the file it belongs to', async () => {
    const onSave = mock()
    const h = mount({ onSave, fileId: 'a.txt' })

    type(h.view, 'a')
    type(h.view, 'b')
    expect(onSave).not.toHaveBeenCalled()

    await tick()
    expect(onSave).toHaveBeenCalledTimes(1)
    const [state, fileId] = onSave.mock.calls[0]!
    expect(state.doc).toBe('ab')
    expect(fileId).toBe('a.txt')
  })

  test('calls the latest onSave, not the one from the first render', async () => {
    const first = mock()
    const second = mock()
    const h = mount({ onSave: first })

    h.update({ onSave: second })
    type(h.view, 'x')
    await tick()

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  test('honours a debounce delay changed after mount', async () => {
    const onSave = mock()
    const h = mount({ onSave, onSaveDebounceDelay: 5_000 })

    h.update({ onSaveDebounceDelay: DEBOUNCE })
    type(h.view, 'x')
    await tick()

    expect(onSave).toHaveBeenCalledTimes(1)
  })

  test('flushes a pending save on unmount', () => {
    const onSave = mock()
    const h = mount({ onSave })

    type(h.view, 'x')
    h.unmount()

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]![0].doc).toBe('x')
  })
})

describe('switching files', () => {
  test('flushes the outgoing file under its own id, then loads the new state', () => {
    const onSave = mock()
    const h = mount({ onSave, fileId: 'a.txt' })

    type(h.view, 'from a')
    h.update({ fileId: 'b.txt', state: { doc: 'from b' } })

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]![1]).toBe('a.txt')
    expect(onSave.mock.calls[0]![0].doc).toBe('from a')
    expect(h.view.state.doc.toString()).toBe('from b')
  })

  test('keeps the current language config across the switch', () => {
    const h = mount({ fileId: 'a.txt', language: 'flat' })
    expect(h.container.querySelector('.cm-lineWrapping')).toBeNull()

    h.update({ language: 'prose' })
    expect(h.container.querySelector('.cm-lineWrapping')).not.toBeNull()

    // the regression: the reloaded state used to revert to the mount-time config
    h.update({ fileId: 'b.txt' })
    expect(h.container.querySelector('.cm-lineWrapping')).not.toBeNull()
  })

  test('still saves edits made after the switch, under the new id', async () => {
    const onSave = mock()
    const h = mount({ onSave, fileId: 'a.txt' })

    h.update({ fileId: 'b.txt' })
    type(h.view, 'later')
    await tick()

    const last = onSave.mock.calls.at(-1)!
    expect(last[1]).toBe('b.txt')
    expect(last[0].doc).toBe('later')
  })
})

describe('dirty state', () => {
  test('fires on the edges only', async () => {
    const onDirtyChange = mock()
    const h = mount({ onSave: mock(), onDirtyChange })

    type(h.view, 'a')
    type(h.view, 'b')
    expect(onDirtyChange.mock.calls).toEqual([[true, 'a.txt']])

    await tick()
    expect(onDirtyChange.mock.calls).toEqual([
      [true, 'a.txt'],
      [false, 'a.txt'],
    ])
  })

  test('stays quiet when nothing has been edited', () => {
    const onDirtyChange = mock()
    mount({ onDirtyChange, state: { doc: 'preloaded' } })
    expect(onDirtyChange).not.toHaveBeenCalled()
  })
})

describe('defaultExtensions options', () => {
  test('omits the line-number gutter by default', () => {
    const h = mount()
    expect(h.container.querySelector('.cm-lineNumbers')).toBeNull()
  })

  test('adds it when asked', () => {
    const h = mount({
      lineNumbers: true,
      state: { doc: 'a\nb\nc' },
    })
    expect(h.container.querySelector('.cm-lineNumbers')).not.toBeNull()
  })

  test('folding survives even with the gutter off, so snapshots stay loadable', () => {
    const h = mount({
      foldGutter: false,
      state: { doc: 'one\ntwo\nthree', folds: [4, 7] },
    })
    expect(serializeEditorState(h.view).folds).toEqual([4, 7])
  })
})

describe('defaults', () => {
  const bare = () => render(<Editor onSaveDebounceDelay={DEBOUNCE} />)

  test('opens in txflow with the default language pack', () => {
    const r = bare()
    expect(r.container.textContent).toContain('start writing')
  })

  test('saves to localStorage under the scratchpad fileId, and restores it', async () => {
    let view: EditorView | undefined
    const first = render(<Editor onSaveDebounceDelay={DEBOUNCE} onViewReady={(v) => (view = v)} />)
    type(view!, 'kept')
    await tick()
    expect(JSON.parse(localStorage.getItem('paladin:editor:scratchpad')!).doc).toBe('kept')
    first.unmount()

    let again: EditorView | undefined
    render(<Editor onViewReady={(v) => (again = v)} />)
    expect(again!.state.doc.toString()).toBe('kept')
  })

  test('a given state wins over what onLoad would return', () => {
    localStorage.setItem('paladin:editor:scratchpad', JSON.stringify({ doc: 'stored' }))
    const h = mount({ fileId: 'scratchpad', state: { doc: 'explicit' } })
    expect(h.view.state.doc.toString()).toBe('explicit')
  })

  test('restores the cursor from localStorage', async () => {
    let view: EditorView | undefined
    const first = render(<Editor onSaveDebounceDelay={DEBOUNCE} onViewReady={(v) => (view = v)} />)
    type(view!, 'hello world')
    view!.dispatch({ selection: { anchor: 5 } })
    await tick()
    first.unmount()

    render(<Editor onViewReady={(v) => (view = v)} />)
    expect(view!.state.selection.main.head).toBe(5)
  })

  test('a cursor move alone does not trigger onSave or report the editor dirty', async () => {
    const onSave = mock()
    const onDirtyChange = mock()
    const h = mount({ state: { doc: 'hello world' }, onSave, onDirtyChange })
    h.view.dispatch({ selection: { anchor: 4 } })
    await tick()
    expect(onSave).not.toHaveBeenCalled()
    expect(onDirtyChange).not.toHaveBeenCalled()
  })

  describe('leaving the page', () => {
    const hide = () => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    }

    test('hiding the tab with unsaved edits saves to localStorage immediately', () => {
      const h = mount({ fileId: 'a.txt', onSaveDebounceDelay: 60_000 })
      type(h.view, 'unsaved')
      expect(localStorage.getItem('paladin:editor:a.txt')).toBeNull()
      hide()
      expect(JSON.parse(localStorage.getItem('paladin:editor:a.txt')!).doc).toBe('unsaved')
    })

    test('calls onLeave once per burst of edits, even when both events fire', () => {
      const onLeave = mock()
      const h = mount({ onLeave, onSaveDebounceDelay: 60_000 })
      type(h.view, 'x')
      hide()
      window.dispatchEvent(new Event('pagehide'))
      expect(onLeave).toHaveBeenCalledTimes(1)
      expect(onLeave.mock.calls[0]![1]).toBe('a.txt')
      type(h.view, 'y')
      window.dispatchEvent(new Event('pagehide'))
      expect(onLeave).toHaveBeenCalledTimes(2)
    })

    test('hiding the tab after only moving the cursor still saves it', () => {
      const onLeave = mock()
      const h = mount({ onLeave, state: { doc: 'hello' }, onSaveDebounceDelay: 60_000 })
      h.view.dispatch({ selection: { anchor: 2 } })
      hide()
      expect(onLeave).toHaveBeenCalledTimes(1)
    })

    test('does nothing when there is nothing unsaved', () => {
      const onLeave = mock()
      mount({ onLeave })
      hide()
      window.dispatchEvent(new Event('pagehide'))
      expect(onLeave).not.toHaveBeenCalled()
    })
  })
})
