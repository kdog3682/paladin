import { createPalette } from "@paladin/ui"
import { fileCommands } from "./commands/files"
import { panelCommands } from "./commands/panel"
import { sessionCommands } from "./commands/session"
import type { PaladinDeps } from "./deps"
import { FILES_PROVIDER, filesProvider } from "./providers/files"
import { projectsProvider } from "./providers/projects"
import { sessionsProvider } from "./providers/sessions"
import { SYMBOLS_PROVIDER, symbolsProvider } from "./providers/symbols"
import { createOnDone } from "./result"
import type { PaladinCtx, PaladinPalette, PaladinResult } from "./types"

export function createPaladinPalette(deps: PaladinDeps): PaladinPalette {
  const palette = createPalette<PaladinCtx, PaladinResult>({
    getContext: () => ({ origin: deps.focus.current(), ...deps.workspace.current() }),
    onDone: createOnDone(deps.focus),
    getShortcut: deps.keybindings.shortcutFor,
  })

  palette.registerCommands([
    ...panelCommands(deps),
    ...sessionCommands(deps),
    ...fileCommands(deps),
  ])

  palette.registerProvider(sessionsProvider(deps))
  palette.registerProvider(projectsProvider(deps))
  palette.registerProvider(filesProvider(deps))
  palette.registerProvider(symbolsProvider(deps))

  return palette
}

/* Cmd+K: every command and search source */
export function openCommands(palette: PaladinPalette) {
  palette.open()
}

/* Cmd+P: files and symbols only */
export function openPicker(palette: PaladinPalette) {
  palette.open({
    providers: [FILES_PROVIDER, SYMBOLS_PROVIDER],
    commands: false,
    placeholder: "Go to file or symbol…",
  })
}
