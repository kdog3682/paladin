import { MOVE_BINDINGS } from "./bindings"
import { cancelMove, commitMove, enterMove, moveStep } from "./session"
import type { MoveDir } from "./move"

export { MOVE_BINDINGS }

export const MOVE_COMMANDS = [
  { id: "mode.move", title: "Move mode", group: "normal", description: "Move, reorder, indent and outdent the selection" },
  { id: "move.up", title: "Move up", group: "move", description: "Reorder earlier (flex/grid) or 1 grid step up (absolute)" },
  { id: "move.down", title: "Move down", group: "move", description: "Reorder later (flex/grid) or 1 grid step down (absolute)" },
  { id: "move.left", title: "Outdent / move left", group: "move", description: "Become the parent's next sibling (flex/grid) or 1 grid step left (absolute)" },
  { id: "move.right", title: "Indent / move right", group: "move", description: "Become the last child of the previous sibling (flex/grid) or 1 grid step right (absolute)" },
  { id: "move.up.big", title: "Move up ×5 / ×10", group: "move" },
  { id: "move.down.big", title: "Move down ×5 / ×10", group: "move" },
  { id: "move.left.big", title: "Outdent / move left ×10", group: "move" },
  { id: "move.right.big", title: "Indent / move right ×10", group: "move" },
  { id: "move.commit", title: "Commit move", group: "move", description: "Apply as one undo step" },
  { id: "move.cancel", title: "Revert move", group: "move" },
]

const step = (dir: MoveDir, big: boolean) => (count: number) => moveStep(dir, big, count)

export const moveHandlers: Record<string, (count: number) => void> = {
  "mode.move": () => enterMove(),
  "move.up": step("up", false),
  "move.down": step("down", false),
  "move.left": step("left", false),
  "move.right": step("right", false),
  "move.up.big": step("up", true),
  "move.down.big": step("down", true),
  "move.left.big": step("left", true),
  "move.right.big": step("right", true),
  "move.commit": () => commitMove(),
  "move.cancel": () => cancelMove(),
}
