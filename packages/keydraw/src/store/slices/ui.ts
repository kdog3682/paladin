import type { Slice } from "../useEditor"

export type ModalKind = "defaults" | "keys" | "loader" | "icons" | "help"

export type ModalState = {
  kind: ModalKind | null
  /* left column (sections) and right column (rows) positions */
  section: number
  row: number
  /* `/` row filter, or null when not filtering */
  filter: string | null
  /* `i` section input line or an inline row edit, or null */
  input: string | null
  /* input is an inline edit of the current row (Enter), not section tokens (`i`) */
  editing: boolean
  /* the filter / input line is taking keys (modal-text) */
  typing: boolean
  /* node defaults: global, or this artboard's overrides */
  scope: "global" | "board"
  /* loader / picker: the highlighted item and query */
  query: string
  index: number
  /* insert as sibling after the focused node (Shift-Alt-l) */
  sibling: boolean
}

export const closedModal: ModalState = { kind: null, section: 0, row: 0, filter: null, input: null, editing: false, typing: false, scope: "global", query: "", index: 0, sibling: false }

export type CmdState = {
  line: string
  /* true while Space is cycling the last token */
  cycling: boolean
  histPos: number | null
  histDraft: string
}

export const idleCmd: CmdState = { line: "", cycling: false, histPos: null, histDraft: "" }

export type UiSlice = {
  cmd: CmdState
  /* oldest first; persisted */
  cmdHistory: string[]
  modal: ModalState
}

export const createUiSlice: Slice<UiSlice> = () => ({
  cmd: idleCmd,
  cmdHistory: [],
  modal: closedModal,
})
