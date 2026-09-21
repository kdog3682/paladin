import { useState } from "react"
import { useHotkeys } from "react-hotkeys-hook"
import { Button, Kbd } from "@paladin/shadcn"
import { HelpPalette, type HelpItem } from "./HelpPalette"

const editorItems: HelpItem[] = [
  { group: "General", title: "Open help", shortcut: "cmd+/" },
  { group: "General", title: "Command menu", description: "Search actions and files", shortcut: "cmd+k" },
  { group: "General", title: "Settings", shortcut: "cmd+," },
  { group: "General", title: "Toggle sidebar", shortcut: "cmd+b" },

  { group: "Editor", title: "Bold", shortcut: "cmd+b" },
  { group: "Editor", title: "Italic", shortcut: "cmd+i" },
  { group: "Editor", title: "Inline code", shortcut: "cmd+e" },
  { group: "Editor", title: "Heading 1", description: "Turn the current block into a heading", shortcut: "cmd+alt+1" },
  { group: "Editor", title: "Duplicate line", shortcut: "cmd+shift+d" },
  { group: "Editor", title: "Move line up", shortcut: "alt+up" },

  { group: "Navigation", title: "Go to file", description: "Fuzzy find across the workspace", shortcut: "cmd+p" },
  { group: "Navigation", title: "Go to line", shortcut: "ctrl+g" },
  { group: "Navigation", title: "Switch to tab 1", shortcut: "cmd+shift+1" },
  { group: "Navigation", title: "Back", shortcut: "cmd+[" },
  { group: "Navigation", title: "Forward", shortcut: "cmd+]" },

  { group: "Tips", title: "Drag files into the editor to embed them", description: "Images, PDFs and video are supported" },
  { group: "Tips", title: "Type / on an empty line for blocks" },
]

/**
 * full editor cheat sheet with consumer-owned open state and hotkey:
 * the parent registers mod+/ via react-hotkeys-hook to toggle, the
 * button opens, and the palette closes itself via esc, backdrop or the
 * close button through onOpenChange. covers multiple groups in
 * first-seen order, rows with and without descriptions, shortcuts
 * rendered as a single raw Kbd, shortcut-less tip rows (no empty Kbd),
 * and a custom title and description
 */
export function EditorCheatSheet() {
  const [open, setOpen] = useState(false)

  useHotkeys(
    // keys match on e.code, so the slash key is "slash", not "/"
    "mod+slash",
    (e) => {
      if (e.repeat) return
      setOpen((o) => !o)
    },
    { preventDefault: true },
  )

  return (
    <div className="flex items-center gap-3 text-sm">
      <Button variant="outline" onClick={() => setOpen(true)}>
        Keyboard shortcuts
      </Button>
      <span className="text-muted-foreground flex items-center gap-2">
        or press <Kbd>cmd+/</Kbd>
        ({open ? "open" : "closed"})
      </span>
      <HelpPalette
        items={editorItems}
        open={open}
        onOpenChange={setOpen}
        title="Editor shortcuts"
        description="Everything you can do without leaving the keyboard"
      />
    </div>
  )
}
