import { useEffect } from "react"
import { CommandPalette, PaletteProvider } from "@paladin/ui"
import type { KeybindingApi } from "./deps"
import { openCommands, openPicker } from "./palette"
import type { PaladinPalette } from "./types"

export type PaletteHostProps = {
  palette: PaladinPalette
  keybindings: KeybindingApi
}

/* mounts the palette and binds Cmd+K and Cmd+P */
export function PaletteHost({ palette, keybindings }: PaletteHostProps) {
  useEffect(() => {
    const offs = [
      keybindings.bind("mod+k", (e) => {
        e.preventDefault()
        openCommands(palette)
      }),
      keybindings.bind("mod+p", (e) => {
        e.preventDefault()
        openPicker(palette)
      }),
    ]
    return () => {
      for (const off of offs) off()
    }
  }, [palette, keybindings])

  return (
    <PaletteProvider palette={palette}>
      <CommandPalette />
    </PaletteProvider>
  )
}
