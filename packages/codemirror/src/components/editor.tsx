import { useEffect, useRef } from 'react'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, placeholder } from '@codemirror/view'
import { type DefaultExtensionOptions, defaultExtensions } from '../defaultExtensions'
import { DEFAULT_FONT, type FontKey, fontExtension } from '../fonts'
import {
  BUILTIN_LANGUAGES,
  DEFAULT_LANGUAGE,
  type LanguageMap,
  type ResolvedLanguage,
  resolveLanguage,
} from '../languages'
import { DEFAULT_FILE_ID, loadFromLocalStorage, saveToLocalStorage } from '../persistence'
import {
  type SerializedState,
  normalizeSnapshot,
  serializeEditorState,
  stateFields,
} from '../state'
import { useDebounced, useLatest } from '../useDebounced'

export type EditorProps = DefaultExtensionOptions & {
  /** Identifies the file being edited; passed back on every onSave and onDirtyChange. Defaults to 'scratchpad'. */
  fileId?: string
  /**
   * Snapshot to load. Read on mount and whenever fileId changes. Defaults to
   * whatever `onLoad` returns for the fileId (localStorage, out of the box).
   */
  state?: SerializedState
  /** Key into `languages`. Unknown keys fall back to plain text with the default appearance. Defaults to 'txflow'. */
  language?: string
  /**
   * Language registry. Defaults to BUILTIN_LANGUAGES, the default language pack.
   * To add languages, spread it: `{ ...BUILTIN_LANGUAGES, python: { support: python() } }`.
   * Hoist it to module scope; a new object per render reconfigures the editor.
   */
  languages?: LanguageMap
  /**
   * Monospace family, applied to whichever appearance the language uses. Fonts
   * belong to the editor, not the language; change it at any time and the
   * editor restyles without remounting. Defaults to 'inconsolata'.
   */
  font?: FontKey
  /** Font size. A number is px; a string is any CSS size. Defaults to 12. */
  fontSize?: number | string
  /** Line height. A number is a unitless multiplier; a string is any CSS value. Defaults to 1.15. */
  lineHeight?: number | string
  /**
   * Fetches the snapshot for a file when no `state` is given, on mount and on
   * every fileId change. Defaults to restoring what the default `onSave` wrote
   * to localStorage, cursor and selection included. Return undefined for an
   * empty document.
   */
  onLoad?: (fileId: string) => SerializedState | undefined
  /**
   * Called (debounced) with the serialized state and the file it belongs to.
   * Defaults to saving to localStorage; pass your own to persist elsewhere,
   * and `onLoad` to read it back.
   */
  onSave?: (state: SerializedState, fileId: string) => void
  /**
   * Called synchronously when the user leaves the page: the tab is hidden or the
   * page is closing. Only fires if there are unsaved edits or cursor moves, once
   * per burst of them. It does not replace `onSave`, which still runs on its own schedule
   * if the user comes back. Defaults to `onSave` (so localStorage unless that is
   * overridden); a custom one must be synchronous (eg `navigator.sendBeacon`), since the page may not
   * outlive it.
   */
  onLeave?: (state: SerializedState, fileId: string) => void
  /**
   * Focus the editor on mount and after a file switch, with the restored cursor
   * scrolled into view. Defaults to true.
   */
  autofocus?: boolean
  /** Debounce window for onSave, in ms. Defaults to 30_000. */
  onSaveDebounceDelay?: number
  /** Fires on the edges only: true on the first edit after a save, false once onSave has run. */
  onDirtyChange?: (dirty: boolean, fileId: string) => void
  /** Called with the full document text after every edit (not on load or file switch). Use `onViewReady` for the initial text. */
  onChange?: (doc: string) => void
  /** Called once with the EditorView so foreign consumers can drive it. */
  onViewReady?: (view: EditorView) => void
  /** Class applied to the editor's container element. Size the editor here. */
  className?: string
}

/**
 * Fills the container so the scroller, not the page, is what scrolls. Without
 * it the editor grows to the height of its document and scroll-into-view has
 * nothing to scroll. In an auto-height container this is a no-op.
 */
const FILL_CONTAINER = EditorView.theme({
  '&': { height: '100%' },
  // a visible (thin) scrollbar rather than the platform's overlay one, so a line
  // that doesn't wrap can be seen to scroll
  '.cm-scroller': { overflow: 'auto', scrollbarWidth: 'thin' },
})

/**
 * Everything the config compartment holds. The font is resolved here rather
 * than baked into an appearance, so the same appearance works in any family.
 */
const DEFAULT_FONT_SIZE = 12
const DEFAULT_LINE_HEIGHT = 1.15

function sizingExtension(fontSize: number | string, lineHeight: number | string): Extension {
  return EditorView.theme({
    '&': { fontSize: typeof fontSize === 'number' ? `${fontSize}px` : fontSize },
    '.cm-content': { lineHeight: String(lineHeight) },
  })
}

function buildLanguageConfig(
  lang: ResolvedLanguage,
  font: FontKey = DEFAULT_FONT,
  fontSize: number | string = DEFAULT_FONT_SIZE,
  lineHeight: number | string = DEFAULT_LINE_HEIGHT
): Extension {
  return [
    placeholder(lang.placeholder),
    lang.support ?? [],
    lang.appearance ?? [],
    lang.extensions ?? [],
    fontExtension(font),
    sizingExtension(fontSize, lineHeight),
    lang.wrapLines ? EditorView.lineWrapping : [],
    FILL_CONTAINER,
  ]
}

export function Editor(props: EditorProps) {
  const {
    fileId = DEFAULT_FILE_ID,
    state,
    language = DEFAULT_LANGUAGE,
    languages = BUILTIN_LANGUAGES,
    font,
    fontSize,
    lineHeight,
    onLoad = loadFromLocalStorage,
    onSave = saveToLocalStorage,
    onLeave,
    autofocus = true,
    onSaveDebounceDelay = 30_000,
    onDirtyChange,
    onViewReady,
    onChange,
    className,
    ...editing
  } = props

  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  // the file a pending save belongs to — advanced only once that save has flushed
  const fileIdRef = useRef(fileId)
  const dirtyRef = useRef(false)
  // the cursor moved since the last save; not an edit, so it stays out of onDirtyChange
  const cursorMovedRef = useRef(false)
  // set once the current edits have been handed to onLeave, so the several
  // events a closing tab fires don't each write
  const leftRef = useRef(false)

  const langRef = useLatest(resolveLanguage(language, languages))
  const fontRef = useLatest(font)
  const fontSizeRef = useLatest(fontSize)
  const lineHeightRef = useLatest(lineHeight)
  const stateRef = useLatest(state)
  const onLoadRef = useLatest(onLoad)
  const onSaveRef = useLatest(onSave)
  const onLeaveRef = useLatest(onLeave ?? onSave)
  const onDirtyChangeRef = useLatest(onDirtyChange)
  const onViewReadyRef = useLatest(onViewReady)
  const onChangeRef = useLatest(onChange)
  const autofocusRef = useLatest(autofocus)

  // the editing options are the rest of the props; they are compared one by
  // one below, so a fresh object per render does not reconfigure the editor
  const editingRef = useLatest(editing)
  const baseCompartment = useRef(new Compartment()).current

  // an explicit `state` wins; otherwise ask onLoad for the current file
  const initialState = () => stateRef.current ?? onLoadRef.current(fileIdRef.current)

  const setDirty = (next: boolean) => {
    if (dirtyRef.current === next) return
    dirtyRef.current = next
    onDirtyChangeRef.current?.(next, fileIdRef.current)
  }

  const saver = useDebounced(() => {
    const view = viewRef.current
    if (!view) return
    onSaveRef.current(serializeEditorState(view), fileIdRef.current)
    cursorMovedRef.current = false
    setDirty(false)
  }, onSaveDebounceDelay)

  // put the cursor a freshly loaded state restored where the user can see it
  const reveal = (view: EditorView) => {
    if (!autofocusRef.current) return
    view.dispatch({
      effects: EditorView.scrollIntoView(view.state.selection.main, { y: 'center' }),
    })
    view.focus()
  }

  const configCompartment = useRef(new Compartment()).current

  // Extensions are rebuilt per state rather than frozen at mount, so a file
  // loaded later picks up the current language config instead of silently
  // reverting to whatever was set the first time the editor rendered.
  const makeState = (json?: SerializedState) => {
    const extensions: Extension[] = [
      baseCompartment.of(defaultExtensions(editingRef.current)),
      configCompartment.of(buildLanguageConfig(langRef.current, fontRef.current, fontSizeRef.current, lineHeightRef.current)),
      EditorView.updateListener.of((u) => {
        if (!u.docChanged && !u.selectionSet) return
        leftRef.current = false
        if (!u.docChanged) {
          // a cursor move alone is only worth writing when the user leaves
          cursorMovedRef.current = true
          return
        }
        setDirty(true)
        saver.run()
        onChangeRef.current?.(u.state.doc.toString())
      }),
    ]
    return json
      ? EditorState.fromJSON(normalizeSnapshot(json), { extensions }, stateFields)
      : EditorState.create({ doc: '', extensions })
  }

  // create the view once
  useEffect(() => {
    const view = new EditorView({
      state: makeState(initialState()),
      parent: containerRef.current!,
    })
    viewRef.current = view
    reveal(view)
    onViewReadyRef.current?.(view)
    return () => {
      saver.flush()
      view.destroy()
      viewRef.current = null
    }
  }, [])

  // leaving the page: hidden tab, closed tab, navigation. `visibilitychange`
  // is the reliable one on mobile, `pagehide` covers the rest.
  useEffect(() => {
    const leave = () => {
      const view = viewRef.current
      if (!view || !(dirtyRef.current || cursorMovedRef.current) || leftRef.current) return
      leftRef.current = true
      onLeaveRef.current(serializeEditorState(view), fileIdRef.current)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') leave()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', leave)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', leave)
    }
  }, [])

  // switch files: persist the outgoing file before it stops being current
  useEffect(() => {
    const view = viewRef.current
    if (!view || fileIdRef.current === fileId) return
    saver.flush()
    fileIdRef.current = fileId
    setDirty(false)
    cursorMovedRef.current = false
    view.setState(makeState(initialState()))
    reveal(view)
  }, [fileId])

  // one compartment, one effect — nothing can drift out of sync with the props
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: configCompartment.reconfigure(
        buildLanguageConfig(langRef.current, fontRef.current, fontSizeRef.current, lineHeightRef.current)
      ),
    })
  }, [language, languages, font, fontSize, lineHeight])

  const { lineNumbers, foldGutter, highlightActiveLine, indentUnit, indentOnInput, tabIndents, history, search, brackets, cursorBlinkRate } = editing
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: baseCompartment.reconfigure(defaultExtensions(editingRef.current)),
    })
  }, [lineNumbers, foldGutter, highlightActiveLine, indentUnit, indentOnInput, tabIndents, history, search, brackets, cursorBlinkRate])

  return <div ref={containerRef} className={className} />
}
