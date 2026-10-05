import { useMemo, useState } from "react"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@paladin/shadcn"
import { fuzzyFilter } from "../lib/fuzzy"

export type PaletteProps<T> = {
  /* screen-reader title for the dialog */
  title: string
  placeholder: string
  items: T[]
  getKey: (item: T) => string
  /* the text fuzzy matching runs against */
  getText: (item: T) => string
  render: (item: T) => React.ReactNode
  onSelect: (item: T) => void
  onClose: () => void
  loading?: boolean
}

/* cmdk with our own fuzzy ranking, so large symbol lists stay fast */
export function Palette<T>({
  title,
  placeholder,
  items,
  getKey,
  getText,
  render,
  onSelect,
  onClose,
  loading,
}: PaletteProps<T>) {
  const [query, setQuery] = useState("")
  const results = useMemo(() => fuzzyFilter(items, query, getText), [items, query])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="top-[20%] translate-y-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{placeholder}</DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} loop className="[&_[cmdk-input-wrapper]]:h-11">
          <CommandInput autoFocus placeholder={placeholder} value={query} onValueChange={setQuery} />
          <CommandList className="max-h-[50vh]">
            <CommandEmpty>{loading ? "Indexing…" : "No matches."}</CommandEmpty>
            {results.map((item) => (
              <CommandItem
                key={getKey(item)}
                value={getKey(item)}
                onSelect={() => {
                  onSelect(item)
                  onClose()
                }}
                className="gap-2"
              >
                {render(item)}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
