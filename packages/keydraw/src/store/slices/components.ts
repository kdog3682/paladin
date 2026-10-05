import type { Node } from "../../model/types"
import type { Slice } from "../useEditor"

/* a saved subtree; plain copies in v1 (§17 question 1) */
export type SavedComponent = { name: string, root: string, nodes: Record<string, Node> }

export type ComponentsSlice = {
  components: Record<string, SavedComponent>
  saveComponent: (c: SavedComponent) => void
  removeComponent: (name: string) => void
}

export const createComponentsSlice: Slice<ComponentsSlice> = (set, get) => ({
  components: {},
  saveComponent: c => set({ components: { ...get().components, [c.name]: c } }),
  removeComponent: name => {
    const { [name]: _gone, ...components } = get().components
    set({ components })
  },
})
