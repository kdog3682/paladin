import { create, type StateCreator } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import { hybridAdapter } from "../storage/idbAdapter"
import { localAdapter } from "../storage/localAdapter"
import { toStateStorage } from "../storage/adapter"
import { createComponentsSlice, type ComponentsSlice } from "./slices/components"
import { createStylesSlice, type StylesSlice } from "./slices/styles"
import { createUiSlice, type UiSlice } from "./slices/ui"
import { setNamedStyles } from "../input-mode/styles"
import { createConfigSlice, type ConfigSlice } from "./slices/config"
import { createDefaultsSlice, mergeDefaults, syncShadows, type DefaultsSlice } from "./slices/defaults"
import { createDocSlice, type DocSlice } from "./slices/doc"
import { createFocusSlice, type FocusSlice } from "./slices/focus"
import { createModeSlice, type ModeSlice } from "./slices/mode"
import { createSearchSlice, type SearchSlice } from "./slices/search"
import { createSelectionSlice, type SelectionSlice } from "./slices/selection"
import { createViewportSlice, type ViewportSlice } from "./slices/viewport"

export type EditorState = DocSlice & FocusSlice & SelectionSlice & ModeSlice & SearchSlice & ViewportSlice & DefaultsSlice & ConfigSlice & StylesSlice & ComponentsSlice & UiSlice

export type Slice<T> = StateCreator<EditorState, [["zustand/persist", unknown]], [], T>

/* everything except uncommitted typing, which is dropped like Esc */
function persisted(s: EditorState) {
  return {
    doc: s.doc,
    past: s.past,
    future: s.future,
    lastChange: s.lastChange,
    focus: s.focus,
    lastVisited: s.lastVisited,
    selected: s.selected,
    selStack: s.selStack,
    lastTouched: s.lastTouched,
    viewport: s.viewport,
    defaults: s.defaults,
    keymapOverride: s.keymapOverride,
    searchHistory: s.searchHistory,
    settings: s.settings,
    styles: s.styles,
    components: s.components,
    cmdHistory: s.cmdHistory,
    modal: s.modal,
  }
}

export const useEditor = create<EditorState>()(
  persist(
    (...a) => ({
      ...createDocSlice(...a),
      ...createFocusSlice(...a),
      ...createSelectionSlice(...a),
      ...createModeSlice(...a),
      ...createSearchSlice(...a),
      ...createViewportSlice(...a),
      ...createDefaultsSlice(...a),
      ...createConfigSlice(...a),
      ...createStylesSlice(...a),
      ...createComponentsSlice(...a),
      ...createUiSlice(...a),
    }),
    {
      name: "keydraw:editor",
      version: 1,
      storage: createJSONStorage(() => toStateStorage(hybridAdapter(localAdapter))),
      partialize: persisted,
      merge: (saved, current) => {
        const s = (saved ?? {}) as Partial<EditorState>
        return { ...current, ...s, defaults: mergeDefaults(s.defaults) }
      },
      onRehydrateStorage: () => state => {
        state?.repairFocus()
        setNamedStyles(state?.styles ?? {})
        if (state) syncShadows(state.defaults.shadows)
        // an open modal comes back open; its uncommitted typing is dropped like Esc (§16)
        if (state?.modal.kind) {
          const picker = state.modal.kind === "loader" || state.modal.kind === "icons"
          useEditor.setState({
            modal: { ...state.modal, input: null, editing: false, typing: false, filter: null },
            mode: picker ? "modal-text" : "modal",
          })
        }
      },
    },
  ),
)

export const S = () => useEditor.getState()

useEditor.getState().repairFocus()
