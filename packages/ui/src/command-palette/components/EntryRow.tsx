import { useEffect, useMemo, useRef } from "react"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@paladin/shadcn"
import { usePalette, usePaletteState } from "../context"
import { argLabel } from "../define"
import { entryId } from "../search"
import type { PaletteCommand, PaletteEntry } from "../types"

type Entry = PaletteEntry<unknown, unknown>

function typeHint(command: PaletteCommand<unknown, unknown>) {
  switch (command.type) {
    case "list":
      return "›"
    case "args":
      return command.args.map(argLabel).join(" ")
    case "text":
      return "text"
    case "action":
      return undefined
  }
}

function describe(entry: Entry) {
  if (entry.kind === "item") {
    const { title, subtitle, icon } = entry.item
    return { title, subtitle, icon, hint: undefined }
  }
  const { title, icon } = entry.command
  return { title, subtitle: undefined, icon, hint: typeHint(entry.command) }
}

export type EntryRowProps = {
  /* cmdk value, unique within the list */
  value: string
  entry: Entry
  selected: boolean
  onSelect: () => void
}

export function EntryRow({ value, entry, selected, onSelect }: EntryRowProps) {
  const palette = usePalette()
  const ref = useRef<HTMLDivElement>(null)
  const view = describe(entry)
  const Icon = view.icon
  const shortcut =
    entry.kind === "command" ? palette.options.getShortcut?.(entry.command.id) : undefined

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" })
  }, [selected])

  return (
    <CommandItem ref={ref} value={value} onSelect={onSelect} className="gap-3">
      {Icon ? <Icon className="size-4 shrink-0 opacity-70" /> : <span className="size-4 shrink-0" />}
      <span className="truncate">{view.title}</span>
      {view.subtitle && (
        <span className="text-muted-foreground min-w-0 truncate text-xs">{view.subtitle}</span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {view.hint && (
          <span className="text-muted-foreground font-mono text-xs">{view.hint}</span>
        )}
        {shortcut && (
          <kbd className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px]">
            {shortcut}
          </kbd>
        )}
      </span>
    </CommandItem>
  )
}

export type EntryListProps = {
  query: string
  placeholder: string
  onQuery: (query: string) => void
}

/* search input plus grouped rows; selection is owned by the palette store */
export function EntryList({ query, placeholder, onQuery }: EntryListProps) {
  const palette = usePalette()
  const groups = usePaletteState((s) => s.entries)
  const selectedIndex = usePaletteState((s) => s.selectedIndex)
  const loading = usePaletteState((s) => s.loading)

  const rows = useMemo(() => {
    let start = 0
    return groups.map((group) => {
      const keys = group.entries.map((entry) => `${group.id}::${entryId(entry)}`)
      const row = { group, keys, start }
      start += group.entries.length
      return row
    })
  }, [groups])

  const allKeys = useMemo(() => rows.flatMap((r) => r.keys), [rows])
  const selectedKey = allKeys[selectedIndex] ?? ""

  function onValueChange(value: string) {
    const index = allKeys.indexOf(value)
    if (index !== -1) palette.actions.select(index)
  }

  return (
    <Command
      shouldFilter={false}
      value={selectedKey}
      onValueChange={onValueChange}
      className="rounded-none bg-transparent"
    >
      <CommandInput autoFocus value={query} onValueChange={onQuery} placeholder={placeholder} />
      <CommandList className="max-h-[min(60vh,420px)]">
        {!loading && <CommandEmpty>No results</CommandEmpty>}
        {rows.map(({ group, keys, start }) => (
          <CommandGroup key={group.id} heading={group.label || undefined}>
            {group.entries.map((entry, i) => (
              <EntryRow
                key={keys[i]}
                value={keys[i]}
                entry={entry}
                selected={start + i === selectedIndex}
                onSelect={() => void palette.actions.choose(start + i)}
              />
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  )
}

