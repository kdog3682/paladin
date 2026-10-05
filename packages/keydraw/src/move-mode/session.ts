import { S } from "../store/useEditor"
import { selectionOf } from "../store/slices/selection"
import type { MoveChange } from "../commands/extraChanges"
import type { MoveDir, MoveStep } from "./move"

/*
 * Uncommitted Move-mode steps. Kept outside the store on purpose:
 * like uncommitted typing, they are dropped on reload (§16).
 */
let steps: MoveStep[] = []

function change(): MoveChange {
  return { type: "move", steps, gridSize: S().defaults.editor.gridSize }
}

export function enterMove() {
  steps = []
  const n = selectionOf(S()).length
  S().setMode("move")
  S().say(`move ${n} node${n === 1 ? "" : "s"} · Enter commit · Esc revert`)
}

/* Adds a step and re-previews the whole session from the committed doc. */
export function moveStep(dir: MoveDir, big: boolean, count: number) {
  const last = steps.at(-1)
  steps =
    last && last.dir === dir && last.big === big
      ? [...steps.slice(0, -1), { ...last, count: last.count + Math.max(1, count) }]
      : [...steps, { dir, big, count: Math.max(1, count) }]
  S().preview(change())
}

/* One undo step for the whole session; repeatable with `.` */
export function commitMove() {
  const c = change()
  S().preview(null)
  if (c.steps.length) S().commit(c, { repeatable: true })
  steps = []
  S().setMode("normal")
}

export function cancelMove() {
  S().preview(null)
  steps = []
  S().setMode("normal")
}

/* For the status line: total arrow presses this session */
export function moveStepCount(): number {
  return steps.reduce((sum, s) => sum + s.count, 0)
}
