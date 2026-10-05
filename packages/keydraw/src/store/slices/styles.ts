import { setNamedStyles } from "../../input-mode/styles"
import type { Slice } from "../useEditor"

export type StylesSlice = {
  /* name → token line, e.g. card → "p4,r8,bg muted,shadow:sm" */
  styles: Record<string, string>
  saveStyle: (name: string, line: string) => void
  removeStyle: (name: string) => void
}

export const createStylesSlice: Slice<StylesSlice> = (set, get) => ({
  styles: {},
  saveStyle: (name, line) => {
    const styles = { ...get().styles, [name]: line }
    setNamedStyles(styles)
    set({ styles })
  },
  removeStyle: name => {
    const { [name]: _gone, ...styles } = get().styles
    setNamedStyles(styles)
    set({ styles })
  },
})
