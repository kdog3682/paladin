import { useShallow } from "zustand/react/shallow"
import { usePaletteState } from "../context"

/* one chip per pushed page, e.g. [Set project status] [paladin] */
export function Breadcrumb() {
  const titles = usePaletteState(
    useShallow((s) => s.pages.flatMap((p) => (p.type === "root" ? [] : [p.command.title]))),
  )
  if (!titles.length) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pt-3">
      {titles.map((title, i) => (
        <span
          key={`${i}:${title}`}
          className="rounded-md bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300"
        >
          {title}
        </span>
      ))}
    </div>
  )
}
