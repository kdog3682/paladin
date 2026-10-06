import { useEffect, useRef } from "react"
import { cn } from "@paladin/shadcn"
import { usePalette, usePaletteState, useTopPage } from "../context"
import { argLabel } from "../define"
import type { ArgSpec, ChipColor, Completion } from "../types"

/* full class strings so tailwind sees them */
const CHIP: Record<ChipColor, { chip: string; ring: string; dot: string }> = {
  blue: {
    chip: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    ring: "ring-blue-500/50",
    dot: "bg-blue-500",
  },
  green: {
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-500/50",
    dot: "bg-emerald-500",
  },
  amber: {
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    ring: "ring-amber-500/50",
    dot: "bg-amber-500",
  },
  rose: {
    chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    ring: "ring-rose-500/50",
    dot: "bg-rose-500",
  },
  violet: {
    chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    ring: "ring-violet-500/50",
    dot: "bg-violet-500",
  },
  cyan: {
    chip: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
    ring: "ring-cyan-500/50",
    dot: "bg-cyan-500",
  },
}

const CYCLE: ChipColor[] = ["blue", "green", "amber", "rose", "violet", "cyan"]

export const argColor = (arg: ArgSpec<never>, index: number) => arg.color ?? CYCLE[index % CYCLE.length]

type CompletionRowProps = {
  completion: Completion
  selected: boolean
  dot: string
  onHover: () => void
  onPick: () => void
}

function CompletionRow({ completion, selected, dot, onHover, onPick }: CompletionRowProps) {
  const ref = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" })
  }, [selected])

  return (
    <li
      ref={ref}
      role="option"
      aria-selected={selected}
      onMouseMove={onHover}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPick}
      className={cn(
        "flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm",
        selected && "bg-accent text-accent-foreground",
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", dot, !selected && "opacity-40")} />
      <span className="truncate">{completion.label ?? completion.value}</span>
      {completion.detail && (
        <span className="text-muted-foreground ml-auto truncate text-xs">{completion.detail}</span>
      )}
    </li>
  )
}

export function ArgsPage() {
  const palette = usePalette()
  const page = useTopPage()
  const completions = usePaletteState((s) => s.completions)
  const selectedIndex = usePaletteState((s) => s.selectedIndex)
  const error = usePaletteState((s) => s.error)
  const input = useRef<HTMLInputElement>(null)
  const activeArg = page.type === "args" ? page.activeArg : 0

  useEffect(() => {
    input.current?.focus()
  }, [activeArg])

  if (page.type !== "args") return null
  const { args } = page.command
  const activeColor = CHIP[argColor(args[activeArg], activeArg)]

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-3">
        {args.map((arg, i) => {
          const color = CHIP[argColor(arg, i)]
          const active = i === activeArg
          const typed = page.values[arg.name] ?? ""
          const chips = arg.multiple ? (page.lists[arg.name] ?? []) : typed && !active ? [typed] : []
          const invalid = Boolean(error) && active

          return (
            <div
              key={arg.name}
              data-arg={arg.name}
              data-active={active}
              onMouseDown={(e) => {
                if (active) return
                e.preventDefault()
                palette.actions.setActiveArg(i)
              }}
              className={cn(
                "flex min-h-7 flex-wrap items-center gap-1 rounded-lg px-1.5 py-0.5 text-sm",
                active ? cn("ring-2", invalid ? "ring-destructive" : color.ring) : "cursor-pointer",
                !active && !chips.length && "text-muted-foreground bg-muted/50 border border-dashed px-2",
              )}
            >
              {chips.map((chip, n) => (
                <span
                  key={`${n}:${chip}`}
                  data-chip={arg.name}
                  className={cn("rounded-md px-2 py-0.5 text-xs font-medium", color.chip)}
                >
                  {chip}
                </span>
              ))}
              {active ? (
                <input
                  ref={input}
                  autoFocus
                  value={typed}
                  placeholder={chips.length ? "" : argLabel(arg)}
                  aria-label={arg.placeholder ?? arg.name}
                  aria-invalid={invalid}
                  style={{ width: `${Math.max(typed.length, chips.length ? 2 : argLabel(arg).length) + 1}ch` }}
                  onChange={(e) => palette.actions.setArg(e.target.value)}
                  className="placeholder:text-muted-foreground min-w-[2ch] bg-transparent py-0.5 text-sm outline-none"
                />
              ) : (
                !chips.length && <span className="font-mono text-xs">{argLabel(arg)}</span>
              )}
            </div>
          )
        })}
      </div>
      {completions.length > 0 && (
        <ul role="listbox" className="max-h-[min(50vh,320px)] overflow-y-auto p-1.5">
          {completions.map((completion, i) => (
            <CompletionRow
              key={completion.value}
              completion={completion}
              selected={i === selectedIndex}
              dot={activeColor.dot}
              onHover={() => palette.actions.select(i)}
              onPick={() => palette.actions.acceptCompletion(i)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
