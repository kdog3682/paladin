import type { Extension, StateField } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import type { Api } from '../api'
import type { ModeStore } from '../modes'

// ---- ctx handed to every command callback -------------------------------
// fields that depend on the live view (editor) are populated by App after mount.
export interface Ctx {
  cwd: string
  activeDir: string
  editor: EditorView // prettier/format reach into this
  api: Api
  setPopup: (content: unknown) => void
  mode: ModeStore
}

// ---- cmdline commands ----------------------------------------------------
export interface ArgSpec {
  name?: string
  optional?: boolean
  freeform?: boolean // captures the rest of the line (NoteSpec, commit msg)
  options?: string[] | ((ctx: Ctx, partial: string) => Promise<string[]> | string[])
  fallback?: (ctx: Ctx) => unknown | Promise<unknown> // used when optional + omitted
}

export interface CommandSpec {
  key: string // 'git commit'
  abbr?: string // 'gc'
  desc?: string
  args?: ArgSpec[]
  run: (ctx: Ctx, ...args: any[]) => unknown
}

// ---- normal mode (touches neither editor nor cmdline) --------------------
export interface NormalBinding {
  seq: string
  run: (ctx: Ctx) => unknown
  desc?: string
}

// ---- a unit of functionality contributes to up to four buses -------------
export interface Feature {
  name: string
  editor?: Extension // CM extensions: fields, viewplugins, inoremap(...)
  commands?: CommandSpec[]
  normal?: NormalBinding[]
  persist?: { key: string; field: StateField<unknown> }[]
}
