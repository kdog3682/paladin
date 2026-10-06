import { usePaletteState, useTopPage } from "../context"
import { modKeyLabel } from "../keys"
import { flattenEntries } from "../search"
import type { GroupedEntries, Page } from "../types"

export type Hint = {
  keys: string
  label: string
}

/* hints for the active page, derived from the key table */
export function footerHints<Ctx, R>(
  page: Page<Ctx, R>,
  entries: GroupedEntries<Ctx, R>,
  selectedIndex: number,
): Hint[] {
  const mod = modKeyLabel()
  const esc: Hint = { keys: "esc", label: page.type === "root" ? "Close" : "Back" }

  switch (page.type) {
    case "root":
    case "list": {
      const entry = flattenEntries(entries)[selectedIndex]
      if (entry?.kind === "command" && entry.command.type !== "action") {
        return [{ keys: "↵", label: "Open" }, { keys: "⇥", label: "Enter" }, esc]
      }
      return [{ keys: "↵", label: entry ? "Run" : "Select" }, esc]
    }
    case "args": {
      const isLast = page.activeArg >= page.command.args.length - 1
      return [
        { keys: "↵", label: isLast ? "Submit" : "Next" },
        { keys: `${mod}↵`, label: "Submit" },
        { keys: "⇥", label: "Arg" },
        { keys: "⌫", label: "Remove chip" },
        esc,
      ]
    }
    case "text":
      return [{ keys: `${mod}↵`, label: "Submit" }, esc]
  }
}

export function FooterHints() {
  const page = useTopPage()
  const entries = usePaletteState((s) => s.entries)
  const selectedIndex = usePaletteState((s) => s.selectedIndex)
  const hints = footerHints(page, entries, selectedIndex)
  const loading = usePaletteState((s) => s.loading)

  return (
    <div className="text-muted-foreground flex items-center gap-4 border-t px-3 py-2 text-xs">
      <span
        aria-hidden={!loading}
        className={
          loading
            ? "size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
            : "size-3"
        }
      />
      <div className="ml-auto flex items-center gap-4">
        {hints.map((hint) => (
          <span key={`${hint.keys}:${hint.label}`} className="flex items-center gap-1.5">
            <kbd className="bg-muted rounded px-1.5 py-0.5 font-mono text-[10px]">{hint.keys}</kbd>
            {hint.label}
          </span>
        ))}
      </div>
    </div>
  )
}
