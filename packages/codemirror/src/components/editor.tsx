import { useEffect, useRef } from 'react'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, placeholder } from '@codemirror/view'
import { defaultExtensions } from '../defaultExtensions'
import { DEFAULT_FONT, type FontKey, fontExtension } from '../fonts'
import { type LanguageMap, type ResolvedLanguage, resolveLanguage } from '../languages'
import {
  type SerializedState,
  normalizeSnapshot,
  serializeEditorState,
  stateFields,
} from '../state'
import { useDebounced, useLatest } from '../useDebounced'

export type EditorProps = {
  /** Identifies the file being edited; passed back on every onSave and onDirtyChange. */
  fileId: string
  /** Snapshot to load. Read on mount and whenever fileId changes. */
  state?: SerializedState
  /** Key into `languages`. Unknown keys fall back to plain text with the default appearance. */
  language: string
  /** Language registry. Hoist it to module scope; a new object per render reconfigures the editor. */
  languages?: LanguageMap
  /**
   * Monospace family. Overrides whatever the language spec prefers, so this is
   * where a user-level font setting belongs. Defaults to 'inconsolata'.
   */
  font?: FontKey
  /** Editing behaviour. Defaults to `defaultExtensions()`; pass `defaultExtensions({ lineNumbers: true })` to tune it. */
  baseExtensions?: Extension[]
  /** Called (debounced) with the serialized state and the file it belongs to. */
  onSave?: (state: SerializedState, fileId: string) => void
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
 * Everything the config compartment holds. The font is resolved here rather
 * than baked into an appearance, so the same appearance works in either family:
 * an explicit prop wins, then the language's preference, then the default.
 */
function buildLanguageConfig(lang: ResolvedLanguage, font?: FontKey): Extension {
  return [
    placeholder(lang.placeholder),
    lang.support ?? [],
    lang.appearance ?? [],
    fontExtension(font ?? lang.font ?? DEFAULT_FONT),
    lang.wrapLines ? EditorView.lineWrapping : [],
  ]
}

export function Editor(props: EditorProps) {
  const {
    fileId,
    state,
    language,
    languages,
    font,
    baseExtensions,
    onSave,
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

  const langRef = useLatest(resolveLanguage(language, languages))
  const fontRef = useLatest(font)
  const stateRef = useLatest(state)
  const onSaveRef = useLatest(onSave)
  const onDirtyChangeRef = useLatest(onDirtyChange)
  const onViewReadyRef = useLatest(onViewReady)

  // built once: the extension array is rebuilt per state, but an unstable
  // default here would reconfigure the editor on every render
  const baseRef = useRef<Extension[] | null>(null)
  if (!baseRef.current) baseRef.current = baseExtensions ?? defaultExtensions()

  const setDirty = (next: boolean) => {
    if (dirtyRef.current === next) return
    dirtyRef.current = next
    onDirtyChangeRef.current?.(next, fileIdRef.current)
  }

  const saver = useDebounced(() => {
    const view = viewRef.current
    if (!view) return
    onSaveRef.current?.(serializeEditorState(view), fileIdRef.current)
    setDirty(false)
  }, onSaveDebounceDelay)

  const configCompartment = useRef(new Compartment()).current

  // Extensions are rebuilt per state rather than frozen at mount, so a file
  // loaded later picks up the current language config instead of silently
  // reverting to whatever was set the first time the editor rendered.
  const makeState = (json?: SerializedState) => {
    const extensions: Extension[] = [
      ...baseRef.current!,
      configCompartment.of(buildLanguageConfig(langRef.current, fontRef.current)),
      EditorView.updateListener.of((u) => {
        if (!u.docChanged) return
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
      state: makeState(stateRef.current),
      parent: containerRef.current!,
    })
    viewRef.current = view
    onViewReadyRef.current?.(view)
    return () => {
      saver.flush()
      view.destroy()
      viewRef.current = null
    }
  }, [])

  // switch files: persist the outgoing file before it stops being current
  useEffect(() => {
    const view = viewRef.current
    if (!view || fileIdRef.current === fileId) return
    saver.flush()
    fileIdRef.current = fileId
    setDirty(false)
    view.setState(makeState(stateRef.current))
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
