import { EditorView, KeyBinding } from '@codemirror/view'
import type { useAppStore } from './store'
import { commands, findByAbbr, isUnnamedScratchpad, defaultScratchpadName, type CommandSpec } from './commandSpec'

export interface ApiCallOptions<T = any> {
  onSuccess?: (result: T) => void
  onError?: (err: unknown) => void
}

export interface ApiClient {
  call<T = any>(method: string, args?: any[], opts?: ApiCallOptions<T>): Promise<T>
}

// ctx = stable references to the outside world (services + store).
export interface AppContext {
  api: ApiClient
  store: typeof useAppStore
  doc: () => { id: string; project: string; title: string } // the doc open in the editor right now
}

// ---------- global keymap: Ctrl/Cmd shortcuts, works in any mode/focus state ----------
// bindings are supplied by the caller (see globalBindings.ts) rather than hardcoded here
export interface GlobalBinding {
  key: string // CM6-style: 'Mod-n', 'Mod-Shift-n', 'Mod-Alt-p', ...
  run: (ctx: AppContext) => void
}

export function installGlobalKeymap(ctx: AppContext, bindings: readonly GlobalBinding[]): () => void {
  const handler = (evt: KeyboardEvent) => {
    if (!(evt.ctrlKey || evt.metaKey)) return
    const key = normalizeGlobalKey(evt)
    const binding = bindings.find((b) => b.key === key)
    if (!binding) return
    evt.preventDefault()
    binding.run(ctx)
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}

function normalizeGlobalKey(evt: KeyboardEvent): string {
  const parts: string[] = ['Mod']
  if (evt.shiftKey) parts.push('Shift')
  if (evt.altKey) parts.push('Alt')
  parts.push(evt.key.length === 1 ? evt.key.toLowerCase() : evt.key)
  return parts.join('-')
}

// ---------- actions, composed into GlobalBinding[] by the app (see globalBindings.ts) ----------
export async function newDocSameParent(ctx: AppContext) {
  const { project, title } = ctx.doc()
  if (isUnnamedScratchpad(project, title)) {
    ctx.store.getState().setCmdline({ cmdError: 'name this doc before creating another' })
    return
  }
  const parent = await ctx.api.call('doc.currentParent')
  const docId = await ctx.api.call('doc.create', [{ parent }])
  ctx.store.getState().setDocMeta({ docId })
}

export async function newScratchpadDoc(ctx: AppContext) {
  const title = defaultScratchpadName()
  const docId = await ctx.api.call('doc.create', [{ project: 'scratchpad', title }])
  ctx.store.getState().setDocMeta({ docId, docProject: 'scratchpad', docTitle: title })
}

export async function saveDoc(ctx: AppContext) {
  const view = ctx.store.getState().view
  if (!view) return
  await ctx.api.call('doc.save', [ctx.doc().id, view.state.toJSON()], {
    onError: (err) => ctx.store.getState().setCmdline({ cmdError: `save failed: ${String(err)}` }),
  })
}

export async function openFzf(ctx: AppContext) {
  await ctx.api.call('fzf.files')
}

export async function printDoc(ctx: AppContext) {
  await ctx.api.call('doc.print', [ctx.doc().id], {
    onError: (err) => ctx.store.getState().setCmdline({ cmdError: `print failed: ${String(err)}` }),
  })
}

// ---------- editor-focused keymap (CM6 native, insert mode only) ----------
export function editorKeymap(ctx: AppContext): KeyBinding[] {
  return [
    {
      key: 'Escape',
      run: (view) => {
        view.contentDOM.blur()
        ctx.store.getState().setMode('normal')
        return true
      },
    },
  ]
}

// wiring: see App.tsx — mounts CM6, installs the global keymap, and listens for normal/cmdline keys

// ---------- normal-mode / cmdline key handling (editor not focused) ----------
export function handleNormalKey(evt: KeyboardEvent, ctx: AppContext) {
  if (evt.ctrlKey || evt.metaKey || evt.altKey) return // global keymap owns these

  const s = ctx.store.getState()
  if (s.mode === 'insert') return
  if (s.mode === 'cmdline') {
    handleWritingKey(evt, ctx)
    return
  }
  handleBufferingKey(evt, ctx)
}

// mode === 'normal': accumulating abbr chars, immediately dispatches zero-arg matches
function handleBufferingKey(evt: KeyboardEvent, ctx: AppContext) {
  const s = ctx.store.getState()

  if (evt.key === 'Escape') {
    if (!s.cmdBuffer) return // no-op on empty buffer
    evt.preventDefault()
    ctx.store.getState().resetCmdline()
    return
  }

  if (evt.key === 'Backspace') {
    if (!s.cmdBuffer) return
    evt.preventDefault()
    ctx.store.getState().setCmdline({ cmdBuffer: s.cmdBuffer.slice(0, -1) })
    return
  }

  if (evt.key === ' ' && s.cmdBuffer) {
    const cmd = findByAbbr(s.cmdBuffer)
    if (cmd && cmd.args.length > 0) {
      evt.preventDefault()
      ctx.store.getState().setCmdline({ cmdCommand: cmd, cmdBuffer: `${cmd.name} ` })
      ctx.store.getState().setMode('cmdline')
      loadSuggestions(cmd, ctx, '')
    }
    return
  }

  if (evt.key.length !== 1) return
  evt.preventDefault()
  const buffer = s.cmdBuffer + evt.key
  const exact = findByAbbr(buffer)
  if (exact && exact.args.length === 0) {
    exact.run(ctx, [])
    ctx.store.getState().resetCmdline()
    return
  }
  ctx.store.getState().setCmdline({ cmdBuffer: buffer })
}

// mode === 'cmdline': writing an arg, no dispatch until Enter
function handleWritingKey(evt: KeyboardEvent, ctx: AppContext) {
  const s = ctx.store.getState()
  const cmd = s.cmdCommand
  if (!cmd) return

  if (evt.key === 'Enter') {
    evt.preventDefault()
    const argSpec = cmd.args[0]
    const value = s.cmdArg.trim()
    const optional = argSpec && 'optional' in argSpec && argSpec.optional
    if (argSpec && !value && !optional) return // required arg missing, stay in writing mode
    cmd.run(ctx, value ? [value] : [])
    ctx.store.getState().resetCmdline()
    ctx.store.getState().setMode('normal')
    return
  }

  if (evt.key === 'Escape') {
    evt.preventDefault()
    ctx.store.getState().resetCmdline()
    ctx.store.getState().setMode('normal')
    return
  }

  if (evt.key === 'Tab') {
    evt.preventDefault()
    const first = s.cmdSuggestions[0]
    if (first) ctx.store.getState().setCmdline({ cmdArg: first })
    return
  }

  if (evt.key === 'Backspace') {
    evt.preventDefault()
    const words = s.cmdArg.split(' ')
    words.pop()
    const cmdArg = words.join(' ')
    ctx.store.getState().setCmdline({ cmdArg })
    loadSuggestions(cmd, ctx, cmdArg)
    return
  }

  if (evt.key === ' ' || evt.key.length === 1) {
    evt.preventDefault()
    const cmdArg = s.cmdArg + evt.key
    ctx.store.getState().setCmdline({ cmdArg })
    loadSuggestions(cmd, ctx, cmdArg)
  }
}

async function loadSuggestions(cmd: CommandSpec, ctx: AppContext, query: string) {
  const spec = cmd.args[0]
  if (!spec || spec.kind !== 'choice') return
  const values = typeof spec.values === 'function' ? await spec.values(ctx) : spec.values
  const filtered = values.filter((v) => v.toLowerCase().includes(query.trim().toLowerCase()))
  ctx.store.getState().setCmdline({ cmdSuggestions: filtered })
}

export { commands }
