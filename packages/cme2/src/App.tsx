import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { cn } from '@bklearn/shadcn'
import { api } from './api'
import { assemble } from './build'
import { foldFeature } from './features/fold'
import { commandsFeature } from './features/commands'
import { editorTheme } from './components/Editor/extensions/theme'
import { decorations } from './components/Editor/extensions/decorations'
import { cmdlineTheme } from './components/Cmdline/extensions/theme'
import { installGlobalKeys, modeStore, setMode, useMode } from './modes'
import type { Ctx, Feature } from './features/types'

const FEATURES: Feature[] = [foldFeature, commandsFeature]

export default function App() {
  const mode = useMode()
  const editorHost = useRef<HTMLDivElement>(null)
  const cmdHost = useRef<HTMLDivElement>(null)
  const editor = useRef<EditorView>()
  const cmdline = useRef<EditorView>()

  useEffect(() => {
    // ctx is created first; editor field is filled in once the view mounts.
    const ctx: Ctx = {
      cwd: '/',
      activeDir: '/',
      editor: null as unknown as EditorView,
      api,
      setPopup: (c) => api.socket.send({ popup: c }),
      mode: modeStore,
    }
    const asm = assemble(FEATURES, ctx)

    const save = () => {
      const json = editor.current!.state.toJSON(asm.persistFields)
      api.put('/doc', json)
    }

    // build the main editor, hydrating persisted fields if present.
    api.get<unknown>('/doc').then((saved) => {
      const base = [editorTheme, decorations, ...asm.editor]
      const state = saved
        ? EditorState.fromJSON(saved, { extensions: base }, asm.persistFields)
        : EditorState.create({ extensions: base })
      editor.current = new EditorView({ state, parent: editorHost.current! })
      ctx.editor = editor.current
      editor.current.focus()
    })

    // cmdline is its own view, deliberately WITHOUT the editor keybinding bus.
    cmdline.current = new EditorView({
      state: EditorState.create({
        extensions: [
          cmdlineTheme,
          EditorView.domEventHandlers({
            keydown(e, view) {
              if (e.key === 'Enter') {
                asm.registry.exec(view.state.doc.toString(), ctx)
                view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } })
                setMode('insert')
                editor.current?.focus()
                return true
              }
              if (e.key === 'Escape') {
                setMode('insert')
                editor.current?.focus()
                return true
              }
              return false
            },
          }),
        ],
      }),
      parent: cmdHost.current!,
    })

    const detach = installGlobalKeys(asm, ctx, {
      command: () => setMode('command'),
      search: () => setMode('search'),
      save,
    })

    return () => {
      detach()
      editor.current?.destroy()
      cmdline.current?.destroy()
    }
  }, [])

  // focus follows mode
  useEffect(() => {
    if (mode === 'command' || mode === 'search') cmdline.current?.focus()
    else if (mode === 'insert') editor.current?.focus()
  }, [mode])

  return (
    <div className="fixed inset-0 grid grid-rows-[1fr_auto_auto] bg-background text-foreground">
      <div className="grid grid-cols-[1fr_320px] overflow-hidden">
        <div ref={editorHost} className="overflow-auto" />
        <aside className="border-l overflow-auto" id="contextbox" />
      </div>
      <div ref={cmdHost} className={cn('border-t', mode !== 'command' && 'opacity-50')} />
      <div className="h-32 border-t overflow-auto font-mono text-xs" id="console" />
    </div>
  )
}
