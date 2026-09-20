import { useEffect, useRef } from 'react'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, placeholder } from '@codemirror/view'
import { defaultExtensions } from '../defaultExtensions'
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

export type EditorProps = {
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
  /** Editing behaviour. Defaults to `defaultExtensions()`; pass `defaultExtensions({ lineNumbers: true })` to tune it. */
  baseExtensions?: Extension[]
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
  '.cm-scroller': { overflow: 'auto' },
})

/**
 * Everything the config compartment holds. The font is resolved here rather
 * than baked into an appearance, so the same appearance works in any family.
 */
function buildLanguageConfig(lang: ResolvedLanguage, font: FontKey = DEFAULT_FONT): Extension {
  return [
    placeholder(lang.placeholder),
    lang.support ?? [],
    lang.appearance ?? [],
    lang.extensions ?? [],
    fontExtension(font),
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
    baseExtensions,
    onLoad = loadFromLocalStorage,
    onSave = saveToLocalStorage,
    onLeave,
    autofocus = true,
    onSaveDebounceDelay = 30_000,
    onDirtyChange,
    onViewReady,
    className,
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
  const stateRef = useLatest(state)
  const onLoadRef = useLatest(onLoad)
  const onSaveRef = useLatest(onSave)
  const onLeaveRef = useLatest(onLeave ?? onSave)
  const onDirtyChangeRef = useLatest(onDirtyChange)
  const onViewReadyRef = useLatest(onViewReady)
  const autofocusRef = useLatest(autofocus)

  // built once: the extension array is rebuilt per state, but an unstable
  // default here would reconfigure the editor on every render
  const baseRef = useRef<Extension[] | null>(null)
  if (!baseRef.current) baseRef.current = baseExtensions ?? defaultExtensions()

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
      ...baseRef.current!,
      configCompartment.of(buildLanguageConfig(langRef.current, fontRef.current)),
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
        buildLanguageConfig(langRef.current, fontRef.current)
      ),
    })
  }, [language, languages, font])

  return <div ref={containerRef} className={className} />
}
