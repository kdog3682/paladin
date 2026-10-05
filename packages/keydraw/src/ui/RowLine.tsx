import { cn } from "@paladin/shadcn"
import { useEffect, useRef, type ReactNode } from "react"

/* one `name | value | token` row, laid out like the attributes panel's rows */
export function RowLine({
  name,
  value,
  token,
  active,
  muted,
  pending,
  children,
}: {
  name: ReactNode
  value: ReactNode
  token?: ReactNode
  active?: boolean
  muted?: boolean
  pending?: boolean
  children?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" })
  }, [active])
  return (
    <div
      ref={ref}
      className={cn(
        "grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-1 text-sm",
        pending && "bg-amber-500/10",
        active && "bg-accent text-accent-foreground",
        muted && !active && "text-muted-foreground",
      )}
    >
      <span className="truncate">{name}</span>
      <span className="max-w-64 truncate font-mono text-xs">{value}</span>
      <span className="w-16 truncate text-right font-mono text-xs text-muted-foreground">{token}</span>
      {children}
    </div>
  )
}
