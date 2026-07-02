import { EditorState, type Extension } from '@codemirror/state'
import { foldState } from '@codemirror/language'
import type { EditorView } from '@codemirror/view'
import type { AppContext } from './commands'

// fold ranges + selection travel with the doc so reopening it restores where you left off
export function serializeEditorState(view: EditorView) {
  return view.state.toJSON({ fold: foldState })
}

export function restoreEditorState(json: any, extensions: Extension) {
  return EditorState.fromJSON(json, { extensions }, { fold: foldState })
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

// debounced autosave while typing
export function scheduleSave(ctx: AppContext, view: EditorView, delayMs = 800) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => flushSave(ctx, view), delayMs)
}

// immediate save — used by Mod-s, blur, and beforeunload
export async function flushSave(ctx: AppContext, view: EditorView) {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  const docId = ctx.doc().id
  if (!docId) return
  await ctx.api.call('doc.save', [docId, serializeEditorState(view)], {
    onError: (err) => ctx.store.getState().setCmdline({ cmdError: `save failed: ${String(err)}` }),
  })
}
