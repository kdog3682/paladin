import { Facet, type Extension, type StateField } from '@codemirror/state'
import { CommandRegistry } from './cmdline/registry'
import { chordResolver } from './editor/keymap'
import type { Ctx, Feature, NormalBinding } from './features/types'

// inject app state into editor extensions that need it.
// ctx.editor is mutable and assigned after the view mounts, so reading it
// from inside an extension at event-time is safe.
export const appCtx = Facet.define<Ctx, Ctx>({ combine: (v) => v[0] })

export interface Assembled {
  editor: Extension[] // ready to drop into EditorState
  registry: CommandRegistry // cmdline lookup/parse/exec
  normal: NormalBinding[] // normal-mode keys
  persistFields: Record<string, StateField<unknown>> // for toJSON/fromJSON
}

export function assemble(features: Feature[], ctx: Ctx): Assembled {
  return {
    editor: [
      chordResolver, // the one resolver that reads everyone's inoremaps
      appCtx.of(ctx),
      ...features.flatMap((f) => (f.editor ? [f.editor] : [])),
    ],
    registry: new CommandRegistry(features.flatMap((f) => f.commands ?? [])),
    normal: features.flatMap((f) => f.normal ?? []),
    persistFields: Object.fromEntries(
      features.flatMap((f) => f.persist ?? []).map((p) => [p.key, p.field]),
    ),
  }
}
