import type { PaladinDeps } from "../deps"
import { defineAction } from "../define"
import type { PaladinCommand } from "../types"

export function panelCommands(deps: PaladinDeps): PaladinCommand[] {
  return [
    defineAction({
      id: "panel.toggle",
      title: "Toggle panel",
      keywords: ["panel", "toggle panel", "close panel", "open panel"],
      group: "Layout",
      run: () => {
        deps.panel.toggle()
        return { focus: "restore" }
      },
    }),
    defineAction({
      id: "panel.toggleExpanded",
      title: "Toggle expanded panel",
      keywords: ["expand", "toggle expanded", "fullscreen panel"],
      group: "Layout",
      run: () => {
        deps.panel.toggleExpanded()
        return { focus: "panel" }
      },
    }),
    defineAction({
      id: "sidebar.toggle",
      title: "Toggle sidebar",
      keywords: ["sidebar", "toggle sidebar"],
      group: "Layout",
      run: () => {
        deps.sidebar.toggle()
        return { focus: "restore" }
      },
    }),
  ]
}
