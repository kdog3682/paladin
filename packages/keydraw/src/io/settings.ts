import { emptyOverride } from "../keys/keymap.default"
import { S, useEditor } from "../store/useEditor"
import { mergeDefaults, syncShadows } from "../store/slices/defaults"
import { setNamedStyles } from "../input-mode/styles"
import { download } from "./image"
import { exportSettingsYaml, parseSettingsYaml } from "./yaml"

export function exportSettings(): void {
  download("keydraw-settings.yaml", exportSettingsYaml(S()), "text/yaml")
}

/* replaces defaults, styles, keymap and components with the file's (parts the file lacks are kept) */
export function importSettings(text: string): void {
  const next = parseSettingsYaml(text)
  useEditor.setState(s => ({
    defaults: next.defaults ? mergeDefaults(next.defaults) : s.defaults,
    styles: next.styles ?? s.styles,
    keymapOverride: next.keymapOverride ? { ...emptyOverride, ...next.keymapOverride } : s.keymapOverride,
    components: next.components ?? s.components,
  }))
  setNamedStyles(S().styles)
  syncShadows(S().defaults.shadows)
}

/* opens a file picker and imports the chosen settings file */
export function pickAndImportSettings(onDone: (message: string) => void): void {
  const input = document.createElement("input")
  input.type = "file"
  input.accept = ".yaml,.yml"
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      importSettings(await file.text())
      onDone("settings imported")
    } catch (err) {
      onDone(`import failed: ${(err as Error).message}`)
    }
  }
  input.click()
}
