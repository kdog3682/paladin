import type { PaladinCommand, PaladinPalette, PaladinProvider } from "./palette/types"

/*
 * a self-contained feature that plugs into the core.
 * only the palette extension points exist so far; panel views and scoped
 * keybindings join when the panel view system and keybinding registry land.
 */
export type Leaf = {
  id: string
  commands?: PaladinCommand[]
  providers?: PaladinProvider[]
}

export type LeafApi = {
  /* registers every extension point of the leaf; returns a disposer */
  registerLeaf: (leaf: Leaf) => () => void
}

export function createLeafApi(palette: PaladinPalette): LeafApi {
  return {
    registerLeaf(leaf) {
      const offs: (() => void)[] = []
      if (leaf.commands?.length) offs.push(palette.registerCommands(leaf.commands))
      for (const provider of leaf.providers ?? []) offs.push(palette.registerProvider(provider))
      return () => {
        for (const off of offs) off()
      }
    },
  }
}
