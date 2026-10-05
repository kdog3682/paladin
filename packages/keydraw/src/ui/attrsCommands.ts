import { ATTRS_BINDINGS } from "./attrsBindings"
import { effectiveDefaults } from "../store/slices/defaults"
import { S } from "../store/useEditor"
import { selectionOf } from "../store/slices/selection"
import { computeRows, cycleRow, nudgeRow, type AttrRow } from "./attrs"
import { useAttrsPanel } from "./attrsPanelState"

export { ATTRS_BINDINGS }

export const ATTRS_COMMANDS = [
  { id: "attrs.focus", title: "Focus attributes panel", group: "normal" },
  { id: "attrs.up", title: "Previous row", group: "attrs" },
  { id: "attrs.down", title: "Next row", group: "attrs" },
  { id: "attrs.cycle", title: "Toggle / cycle value", group: "attrs" },
  { id: "attrs.cycle.back", title: "Cycle value backward", group: "attrs" },
  { id: "attrs.nudge.up", title: "Nudge +1", group: "attrs" },
  { id: "attrs.nudge.down", title: "Nudge −1", group: "attrs" },
  { id: "attrs.nudge.up.big", title: "Nudge +10", group: "attrs" },
  { id: "attrs.nudge.down.big", title: "Nudge −10", group: "attrs" },
  { id: "attrs.edit", title: "Edit value inline", group: "attrs" },
  { id: "attrs.reset", title: "Reset to default", group: "attrs" },
  { id: "attrs.exit", title: "Back to canvas", group: "attrs" },
]

export function currentRows(): AttrRow[] {
  const s = S()
  return computeRows({
    doc: s.doc,
    draft: s.draft,
    ids: selectionOf(s),
    defaults: effectiveDefaults(s),
    all: s.settings.attrs === "all",
  })
}

function activeRow(): AttrRow | undefined {
  const rows = currentRows()
  if (!rows.length) return undefined
  const { row, setRow } = useAttrsPanel.getState()
  const i = Math.min(row, rows.length - 1)
  if (i !== row) setRow(i)
  return rows[i]
}

function set(name: string, value: unknown, merge?: string) {
  S().commit({ type: "setProps", props: { [name]: value } }, { merge, repeatable: true })
}

function moveRow(d: number, count: number) {
  const n = currentRows().length
  if (!n) return
  const { row, setRow } = useAttrsPanel.getState()
  setRow(Math.max(0, Math.min(n - 1, row + d * Math.max(1, count))))
}

function cycle(dir: 1 | -1) {
  const row = activeRow()
  if (!row) return
  const v = cycleRow(row, dir)
  if (v === undefined) return S().say(`${row.name} is not toggleable · Enter to edit`)
  set(row.name, v)
}

function nudge(d: number) {
  const row = activeRow()
  if (!row) return
  const v = nudgeRow(row, d)
  if (v === undefined) return S().say(`${row.name} has no numeric value to nudge`)
  set(row.name, v, `attrs-nudge:${row.name}`)
}

export const attrsHandlers: Record<string, (count: number) => void> = {
  "attrs.focus": () => {
    useAttrsPanel.getState().setRow(0)
    S().setMode("attrs")
  },
  "attrs.up": (c) => moveRow(-1, c),
  "attrs.down": (c) => moveRow(1, c),
  "attrs.cycle": () => cycle(1),
  "attrs.cycle.back": () => cycle(-1),
  "attrs.nudge.up": (c) => nudge(Math.max(1, c)),
  "attrs.nudge.down": (c) => nudge(-Math.max(1, c)),
  "attrs.nudge.up.big": () => nudge(10),
  "attrs.nudge.down.big": () => nudge(-10),
  "attrs.edit": () => {
    const row = activeRow()
    if (row) useAttrsPanel.getState().setEditing(row.name)
  },
  "attrs.reset": () => {
    const row = activeRow()
    if (!row) return
    S().commit(
      { type: "resetProps", names: [row.name], nodeDefaults: effectiveDefaults(S()).nodes },
      { repeatable: true },
    )
  },
  "attrs.exit": () => {
    useAttrsPanel.getState().setEditing(null)
    S().setMode("normal")
  },
}
