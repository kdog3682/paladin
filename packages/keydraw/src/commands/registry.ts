import { ARRANGE_COMMANDS } from "../arrange/bindings"
import { CMD_COMMANDS } from "../cmdline/bindings"
import { MODAL_COMMANDS } from "../ui/modalBindings"
import { MOVE_COMMANDS } from "../move-mode/commands"
import { SEARCH_COMMANDS } from "../search/search"
import { ATTRS_COMMANDS } from "../ui/attrsCommands"

export type CommandDef = {
  id: string
  title: string
  /* mode or command group, used by the help palette and which-key */
  group: string
  description?: string
}

const c = (group: string, id: string, title: string, description?: string): CommandDef => ({ id, title, group, description })

export const COMMANDS: CommandDef[] = [
  ...MOVE_COMMANDS,
  ...ARRANGE_COMMANDS,
  ...CMD_COMMANDS,
  ...MODAL_COMMANDS,
  ...ATTRS_COMMANDS,
  ...SEARCH_COMMANDS,
  c("navigate", "focus.prev", "Previous sibling"),
  c("navigate", "focus.next", "Next sibling"),
  c("navigate", "focus.parent", "Parent"),
  c("navigate", "focus.child", "Drill in", "the last-visited child, or else the first child"),
  c("navigate", "focus.readNext", "Next node in reading order"),
  c("navigate", "focus.readPrev", "Previous node in reading order"),
  c("navigate", "focus.first", "First node"),
  c("navigate", "focus.last", "Last node"),
  c("navigate", "hint.start", "Hint jump", "type a label to focus a visible node"),
  c("insert", "arrow.start", "Arrow to node", "type a hint label: an arrow from the selection, bound to both ends"),

  c("select", "select.toggle", "Toggle in selection"),
  c("select", "select.extendPrev", "Extend selection to previous sibling"),
  c("select", "select.extendNext", "Extend selection to next sibling"),
  c("select", "select.expand", "Expand selection", "siblings, then the parent, …"),
  c("select", "select.shrink", "Shrink selection"),
  c("select", "select.clear", "Clear selection"),

  c("edit", "edit.delete", "Delete"),
  c("edit", "edit.yank", "Yank"),
  c("edit", "edit.pasteChild", "Paste as last child"),
  c("edit", "edit.pasteSibling", "Paste as next sibling"),
  c("edit", "edit.repeat", "Repeat last change"),
  c("edit", "style.yank", "Yank style"),
  c("edit", "style.paste", "Paste style"),
  c("edit", "history.undo", "Undo"),
  c("edit", "history.redo", "Redo"),

  c("insert", "insert.rect", "Insert rect"),
  c("insert", "insert.ellipse", "Insert ellipse"),
  c("insert", "insert.text", "Insert text block"),
  c("insert", "insert.spanChild", "Insert text span (child)"),
  c("insert", "insert.spanSibling", "Insert text span (sibling)"),

  c("text", "text.edit", "Edit text"),
  c("text", "text.commit", "Commit text"),
  c("text", "text.newline", "Newline"),
  c("text", "text.cancel", "Cancel text edit"),
  c("text", "text.backspace", "Delete character"),
  c("text", "text.deleteWord", "Delete word"),

  c("input", "mode.input", "Input mode", "type property tokens"),
  c("input", "input.space", "End token / cycle value"),
  c("input", "input.spaceBack", "Cycle value backward"),
  c("input", "input.backspace", "Delete character"),
  c("input", "input.deleteToken", "Delete token"),
  c("input", "input.accept", "Accept completion"),
  c("input", "input.commit", "Commit tokens"),
  c("input", "input.escape", "Revert tokens / exit"),

  c("nudge", "nudge.up", "Nudge +1"),
  c("nudge", "nudge.down", "Nudge -1"),
  c("nudge", "nudge.up10", "Nudge +10"),
  c("nudge", "nudge.down10", "Nudge -10"),

  c("view", "view.zoomIn", "Zoom in"),
  c("view", "view.zoomOut", "Zoom out"),
  c("view", "view.zoomReset", "Zoom 100%"),
  c("view", "view.center", "Center on focus"),
  c("view", "view.fit", "Fit artboard"),
  c("view", "view.panDown", "Pan down half a screen"),
  c("view", "view.panUp", "Pan up half a screen"),
  c("view", "view.scrollDown", "Scroll down"),
  c("view", "view.scrollUp", "Scroll up"),
  c("view", "view.layerTree", "Toggle layer tree"),
  c("view", "board.next", "Next artboard"),
  c("view", "board.prev", "Previous artboard"),
]

export const commandById = new Map(COMMANDS.map(d => [d.id, d]))
