import type { Change } from "../../commands/changes"
import type { Mode } from "../../model/types"
import type { Slice } from "../useEditor"

export type TextEdit = {
  /* node being edited (or the id a pending insert will get) */
  target: string
  buffer: string
  /* pending span insert from o / O; committed with the text, dropped on Esc */
  insert: Change | null
}

export type ModeSlice = {
  mode: Mode
  /* mode to return to when Text mode ends */
  prevMode: Mode
  /* pending key sequence and count, shown in the status line */
  pendingKeys: string[]
  pendingCount: number | null
  /* Input-mode token line (uncommitted tokens) */
  line: string
  /* true while Space is cycling the last token */
  cycling: boolean
  text: TextEdit | null
  /* f-hint state; null when inactive */
  hint: { typed: string, /* "arrow": the target completes an arrow from the selection */ purpose?: "arrow" } | null
  /* last-touched numeric prop, the nudge target */
  lastTouched: string | null
  /* transient status-line message */
  message: string | null
  setMode: (mode: Mode) => void
  say: (message: string | null) => void
}

export const createModeSlice: Slice<ModeSlice> = set => ({
  mode: "normal",
  prevMode: "normal",
  pendingKeys: [],
  pendingCount: null,
  line: "",
  cycling: false,
  text: null,
  hint: null,
  lastTouched: null,
  message: null,
  setMode: mode => set({ mode }),
  say: message => set({ message }),
})
