import { EditorState, type Extension } from '@codemirror/state'
import { foldState } from '@codemirror/language'
import type { EditorView } from '@codemirror/view'
import type { AppContext } from './commands/types'

const AUTOSAVE_DEBOUNCE_MS = 3 * 60 * 1000

// fold ranges + selection travel with the doc so reopening it restores where you left off
export function serializeEditorState(view: EditorView) {
  return view.state.toJSON({ fold: foldState })
}

export function restoreEditorState(json: any, extensions: Extension) {
  return EditorState.fromJSON(json, { extensions }, { fold: foldState })
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

// updates the backend's in-memory copy (fast, marks it dirty), then flushes to disk
export function scheduleSave(ctx: AppContext, view: EditorView) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    await flushSave(ctx, view)
    await flushToDisk(ctx)
  }, AUTOSAVE_DEBOUNCE_MS)
}

// immediate in-memory save — used by Mod-s, blur, beforeunload
export async function flushSave(ctx: AppContext, view: EditorView) {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  const docId = ctx.doc().id
  if (!docId) return
  await ctx.api.call('doc.save', [docId, serializeEditorState(view)], undefined, (err) =>
    ctx.store.getState().setCmdline({ cmdError: `save failed: ${String(err)}` })
  )
}

// writes dirty docs to disk — backend tracks dirtiness, so calling this repeatedly is cheap
export async function flushToDisk(ctx: AppContext): Promise<string[]> {
  return ctx.api.call(
    'system.flush',
    [],
    (files: string[]) => ctx.store.getState().postLog({ type: 'flush', payload: { files } }),
    (err) => ctx.store.getState().setCmdline({ cmdError: `flush failed: ${String(err)}` })
  )
}
