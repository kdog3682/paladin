import { useMemo } from "react"
import {
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Kbd,
} from "@paladin/shadcn"

export type HelpItem = {
  /* row label */
  title: string
  /* section heading; items are grouped by this in first-seen order */
  group: string
  /* optional secondary line under the title */
  description?: string
  /* shown as-is in a single Kbd, e.g. "cmd+shift+1" */
  shortcut?: string
}

export type HelpPaletteProps = {
  /* entries to display */
  items: HelpItem[]
  /* open state, owned by the consumer (the consumer also owns the mod+/ hotkey) */
  open: boolean
  /* called on esc, backdrop click and the close button */
  onOpenChange: (open: boolean) => void
  /* dialog title */
  title?: string
  /* optional subtitle under the title */
  description?: string
  /* extra classes for the dialog content */
  className?: string
}

type HelpGroup = {
  name: string
  items: HelpItem[]
}

const groupItems = (items: HelpItem[]): HelpGroup[] => {
  const groups = new Map<string, HelpItem[]>()
  for (const item of items) {
    const list = groups.get(item.group)
    if (list) list.push(item)
    else groups.set(item.group, [item])
  }
  return [...groups].map(([name, items]) => ({ name, items }))
}

export function HelpPalette({
  items,
  open,
  onOpenChange,
  title = "Keyboard shortcuts",
  description,
  className,
}: HelpPaletteProps) {
  const groups = useMemo(() => groupItems(items), [items])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("gap-0 overflow-hidden p-0 sm:max-w-sm", className)}
        // silences radix's missing-description warning when none is given
        {...(!description && { "aria-describedby": undefined })}
      >
        <DialogHeader className="bg-muted/50 border-b px-4 py-3">
          <DialogTitle className="text-xs">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-[11px]">{description}</DialogDescription>
          )}
        </DialogHeader>

        <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
          {groups.length ? (
            <div className="flex flex-col gap-4 p-4">
              {groups.map((group) => (
                <HelpSection key={group.name} group={group} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground p-4 text-[11px]">No shortcuts</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function HelpSection({ group }: { group: HelpGroup }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-1 text-xs font-medium">{group.name}</h3>
      <ul className="divide-y pl-2">
        {group.items.map((item, i) => (
          <HelpRow key={`${item.title}-${i}`} item={item} />
        ))}
      </ul>
    </section>
  )
}

function HelpRow({ item }: { item: HelpItem }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1">
      <div className="min-w-0">
        <div className="truncate text-[11px]">{item.title}</div>
        {item.description && (
          <div className="text-muted-foreground truncate text-[10px]">
            {item.description}
          </div>
        )}
      </div>
      {item.shortcut && <Kbd className="shrink-0">{item.shortcut}</Kbd>}
    </li>
  )
}
