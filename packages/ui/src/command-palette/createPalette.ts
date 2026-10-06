import type { StoreApi } from "zustand/vanilla"
import { createRegistry } from "./registry"
import { createPaletteStore, type PaletteActions } from "./store"
import type {
  OpenOptions,
  PaletteCommand,
  PaletteOptions,
  PaletteState,
  SearchProvider,
} from "./types"

export type PaletteInstance<Ctx, R> = {
  registerCommands: (cmds: PaletteCommand<Ctx, R>[]) => () => void
  registerProvider: (p: SearchProvider<Ctx, R>) => () => void
  open: (opts?: OpenOptions) => void
  close: () => void
  store: StoreApi<PaletteState<Ctx, R>>
  /* store actions, used by the palette components */
  actions: PaletteActions<Ctx, R>
  /* the options the palette was created with */
  options: PaletteOptions<Ctx, R>
}

export function createPalette<Ctx, R = void>(opts: PaletteOptions<Ctx, R>): PaletteInstance<Ctx, R> {
  const registry = createRegistry<Ctx, R>()
  const { store, actions } = createPaletteStore(registry, opts)

  /* registrations while open show up immediately on the root page */
  registry.subscribe(() => {
    const { open, pages } = store.getState()
    if (open && pages[pages.length - 1].type === "root") actions.refresh()
  })

  return {
    registerCommands: registry.registerCommands,
    registerProvider: registry.registerProvider,
    open: actions.open,
    close: actions.close,
    store,
    actions,
    options: opts,
  }
}
