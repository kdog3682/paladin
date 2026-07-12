import { useEffect, useRef } from 'react'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView, placeholder } from '@codemirror/view'
import { defaultExtensions, stateFields } from './defaultExtensions'
import * as THEMES from './themes'

export type SerializedState = Record<string, unknown>

export interface CodeEditorProps {
  /** Identifies the file being edited; passed back on every onSave. */
  fileId: string
  /** Serialized snapshot to deserialize (doc + selection + history + folds). Omit for an empty doc. */
  state?: SerializedState
  /** Active language key; drives the placeholder and which languageExtensions apply. */
  language: string
  /** Map of language key -> extension(s), e.g. { python: python() }. */
  languageExtensions?: Record<string, Extension>
  /** Soft-wrap long lines. Defaults to true. */
  wrapLines?: boolean
  /** Theme key resolved against ./themes. Defaults to 'nord'. */
  theme?: string
  /** Extra extensions included alongside the defaults (baked in once at mount). */
  baseExtensions?: Extension[]
  /** Called (debounced) with the serialized state and the file it belongs to. */
  onSave?: (state: SerializedState, fileId: string) => void
  /** Debounce window for onSave, in ms. Defaults to 30_000. */
  onSaveDebounceDelay?: number
  /** Called once with the EditorView so foreign consumers can drive it. */
  onViewReady?: (view: EditorView) => void
  /** Class applied to the editor's container element. */
  className?: string
}

type Debounced = { run: () => void; flush: () => void; cancel: () => void }

function createDebounce(fn: () => void, wait: number): Debounced {
  let t: ReturnType<typeof setTimeout> | null = null
  const cancel = () => {
    if (t) clearTimeout(t)
    t = null
  }
  return {
    run() {
      cancel()
      t = setTimeout(() => {
        t = null
        fn()
      }, wait)
    },
    flush() {
      if (!t) return
      cancel()
      fn()
    },
    cancel,
  }
}

export default function CodeEditor(props: CodeEditorProps) {
  const {
    fileId,
    state,
    language,
    languageExtensions,
    wrapLines = true,
    theme = 'nord',
    baseExtensions,
    onSave,
    onSaveDebounceDelay = 30_000,
    onViewReady,
    className,
  } = props

  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const fileIdRef = useRef(fileId) // so a debounced save targets the right file

  const langCompartment = useRef(new Compartment()).current
  const wrapCompartment = useRef(new Compartment()).current
  const themeCompartment = useRef(new Compartment()).current

  const saverRef = useRef<Debounced | null>(null)
  if (!saverRef.current) {
    saverRef.current = createDebounce(() => {
      const view = viewRef.current
      if (view) onSave?.(view.state.toJSON(stateFields), fileIdRef.current)
    }, onSaveDebounceDelay)
  }
  const saver = saverRef.current

  const languageConf = (lang: string): Extension => [
    placeholder(`start typing in ${lang}`),
    languageExtensions?.[lang] ?? [],
  ]

  const wrapConf = (wrap: boolean): Extension =>
    wrap ? EditorView.lineWrapping : []

  const themeConf = (name: string): Extension =>
    (THEMES as Record<string, Extension>)[name] ?? []

  // extensions are built once and reused for every state we load —
  // dynamic bits (language / wrap / theme) live in compartments
  const extensionsRef = useRef<Extension[] | null>(null)
  if (!extensionsRef.current) {
    extensionsRef.current = [
      ...defaultExtensions,
      ...(baseExtensions ?? []),
      langCompartment.of(languageConf(language)),
      wrapCompartment.of(wrapConf(wrapLines)),
      themeCompartment.of(themeConf(theme)),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) saver.run()
      }),
    ]
  }

  const makeState = (json?: SerializedState) =>
    json
      ? EditorState.fromJSON(json, { extensions: extensionsRef.current! }, stateFields)
      : EditorState.create({ doc: '', extensions: extensionsRef.current! })

  // create the view once
  useEffect(() => {
    const view = new EditorView({
      state: makeState(state),
      parent: containerRef.current!,
    })
    viewRef.current = view
    onViewReady?.(view)
    return () => {
      saver.flush()
      view.destroy()
      viewRef.current = null
    }
  }, [])

  // switch files: persist the old file, then load the new state
  useEffect(() => {
    const view = viewRef.current
    if (!view || fileIdRef.current === fileId) return
    saver.flush()
    fileIdRef.current = fileId
    view.setState(makeState(state))
  }, [fileId])

  // language: just reconfigure the compartment (also re-applied after a file load)
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: langCompartment.reconfigure(languageConf(language)),
    })
  }, [language, fileId])

  // line wrapping
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapCompartment.reconfigure(wrapConf(wrapLines)),
    })
  }, [wrapLines])

  // theme (THEMES is a constant module)
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.reconfigure(themeConf(theme)),
    })
  }, [theme])

  return <div ref={containerRef} className={className} />
}
