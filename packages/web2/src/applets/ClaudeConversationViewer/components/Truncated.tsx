import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

const MAX_LINES = 12
const MAX_CHARS = 1200

/* the first slice of text that fits the limits, or null when it all fits */
const clip = (text: string): { shown: string; hidden: number } | null => {
  const lines = text.split("\n")
  if (lines.length <= MAX_LINES && text.length <= MAX_CHARS) return null
  let shown = lines.slice(0, MAX_LINES).join("\n")
  if (shown.length > MAX_CHARS) shown = shown.slice(0, MAX_CHARS)
  return { shown, hidden: text.length - shown.length }
}

const kb = (n: number) => (n < 1024 ? `${n} chars` : `${(n / 1024).toFixed(1)}k chars`)

type Props = { text: string; className?: string; render?: (text: string) => ReactNode }

/** text cut past a threshold. click to show all of it, click again to cut it back */
export function Truncated({ text, className = "", render }: Props) {
  const [open, setOpen] = useState(false)
  const cut = clip(text)
  // rendered output carries its own layout, so it is not wrapped as preformatted text
  const Wrap = (s: string) =>
    render ? <div className={className}>{render(s)}</div> : <pre className={`whitespace-pre-wrap break-words ${className}`}>{s}</pre>
  if (!cut) return Wrap(text)
  return (
    <div
      onClick={() => setOpen(!open)}
      className="cursor-pointer"
      title={open ? "click to collapse" : "click to expand"}
    >
      {Wrap(open ? text : cut.shown)}
      <div className="mt-1 select-none text-[11px] text-neutral-400 hover:text-neutral-600">
        {open ? "▲ show less" : `▼ … ${kb(cut.hidden)} more`}
      </div>
    </div>
  )
}

/** the "toggle commands" button bumps `n`, and every disclosure follows `open` */
export const OpenAll = createContext<{ open: boolean; n: number }>({ open: false, n: 0 })

type DisclosureProps = { label: ReactNode; hint?: ReactNode; children: ReactNode; tone?: string; global?: boolean }

/** a one-line header whose body is not rendered until clicked */
export function Disclosure({ label, hint, children, tone = "text-neutral-500", global = true }: DisclosureProps) {
  const [open, setOpen] = useState(false)
  const all = useContext(OpenAll)
  useEffect(() => {
    if (global && all.n) setOpen(all.open)
  }, [all.n])
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={`flex w-full items-baseline gap-2 text-left text-xs hover:text-neutral-900 ${tone}`}
      >
        <span className="w-3 shrink-0 text-neutral-400">{open ? "▾" : "▸"}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {hint && <span className="shrink-0 text-neutral-400">{hint}</span>}
      </button>
      {open && <div className="ml-5 mt-1">{children}</div>}
    </div>
  )
}
