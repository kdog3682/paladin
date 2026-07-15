import {useState, type ReactNode} from "react"
import {ChevronDown, ChevronRight} from "lucide-react"

type Json = string | number | boolean | null | undefined | Json[] | {[k: string]: Json}
type Path = (string | number)[]
type OnValueClick = (k: Path, v: Json) => void

interface ViewerProps {
  data: Json
  maxWidth?: number
  onValueClick?: OnValueClick
}

interface NodeCtx {
  maxWidth: number
  onValueClick?: OnValueClick
}

const keyClass = "text-violet-700"
const dashClass = "text-slate-300 select-none"
const punctClass = "text-slate-400"

function isPrimitive(v: Json): v is string | number | boolean | null | undefined {
  return v === null || v === undefined || typeof v === "string" || typeof v === "number" || typeof v === "boolean"
}
function isArr(v: Json): v is Json[] {
  return Array.isArray(v)
}
function isObj(v: Json): v is {[k: string]: Json} {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function isUrlKey(key: string | number): boolean {
  const k = String(key).toLowerCase()
  return k.endsWith("url") || k.endsWith("urls") || k.endsWith("link") || k.endsWith("links")
}
function looksImage(url: string): boolean {
  const clean = url.split("?")[0].split("#")[0].toLowerCase()
  return /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/.test(clean)
}
function isLongText(v: Json): boolean {
  return typeof v === "string" && (v.includes("\n") || v.length > 400)
}
function isMediaValue(key: string | number | undefined, v: Json): boolean {
  if (key === undefined || !isUrlKey(key)) return false
  if (typeof v === "string") return true
  if (isArr(v) && v.length > 0 && v.every((x) => typeof x === "string")) return true
  return false
}

// compact single-line representation, or null when the value must render as a block
function inlineOf(v: Json, key: string | number | undefined): string | null {
  if (isMediaValue(key, v)) return null
  if (v === null || v === undefined) return "null"
  if (typeof v === "boolean" || typeof v === "number") return String(v)
  if (typeof v === "string") return isLongText(v) ? null : v
  if (isArr(v)) {
    const parts: string[] = []
    for (const item of v) {
      const s = inlineOf(item, undefined)
      if (s === null) return null
      parts.push(s)
    }
    return "[" + parts.join(", ") + "]"
  }
  const parts: string[] = []
  for (const [k, val] of Object.entries(v)) {
    const s = inlineOf(val, k)
    if (s === null) return null
    parts.push(k + ": " + s)
  }
  return "{" + parts.join(", ") + "}"
}

function typeColor(v: Json): string {
  if (v === null || v === undefined) return "text-slate-400 italic"
  if (typeof v === "number") return "text-amber-700"
  if (typeof v === "boolean") return "text-sky-700"
  return "text-emerald-700"
}
function display(v: Json): string {
  if (v === null || v === undefined) return "null"
  return String(v)
}

function clickWrap(ctx: NodeCtx, path: Path, v: Json, node: ReactNode): ReactNode {
  const active = Boolean(ctx.onValueClick)
  return (
    <span
      onClick={active ? () => ctx.onValueClick?.(path, v) : undefined}
      className={active ? "cursor-pointer rounded px-0.5 hover:bg-amber-100/70" : ""}
    >
      {node}
    </span>
  )
}

function Media({url}: {url: string}) {
  const [err, setErr] = useState(false)
  if (looksImage(url)) {
    if (err) {
      return (
        <span className="inline-flex max-w-[280px] items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
          <span className="truncate">{url}</span>
        </span>
      )
    }
    return (
      <img
        src={url}
        alt=""
        onError={() => setErr(true)}
        className="max-h-[220px] max-w-[300px] rounded-md border border-slate-200 object-contain"
      />
    )
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <iframe src={url} title={url} className="h-[220px] w-[340px] rounded-md border border-slate-200 bg-white" />
      <a href={url} target="_blank" rel="noreferrer" className="max-w-[340px] truncate text-xs text-sky-600 hover:underline">
        {url}
      </a>
    </span>
  )
}

function MediaField({keyName, value}: {keyName: string | number; value: Json}) {
  if (typeof value === "string") return <Media url={value} />
  return (
    <div className="flex flex-wrap gap-2">
      {(value as string[]).map((u, i) => (
        <Media key={i} url={u} />
      ))}
    </div>
  )
}

function Indent({children}: {children: ReactNode}) {
  return <div className="ml-1.5 border-l border-slate-200 pl-3">{children}</div>
}

function PrimChip({value, path, ctx}: {value: Json; path: Path; ctx: NodeCtx}) {
  const active = Boolean(ctx.onValueClick)
  return (
    <span
      onClick={active ? () => ctx.onValueClick?.(path, value) : undefined}
      className={
        "rounded border border-slate-200 bg-white px-1.5 py-0.5 " +
        typeColor(value) +
        (active ? " cursor-pointer hover:bg-amber-50" : "")
      }
    >
      {display(value)}
    </span>
  )
}

function Branch({
  value,
  path,
  depth,
  ctx,
  label,
  marker,
}: {
  value: Json[] | {[k: string]: Json}
  path: Path
  depth: number
  ctx: NodeCtx
  label?: string
  marker?: string
}) {
  const [open, setOpen] = useState(true)
  const arr = isArr(value)
  const count = arr ? value.length : Object.keys(value).length
  const summary = arr ? "[ " + count + " ]" : "{ " + count + " }"
  return (
    <div>
      <div className="flex items-center gap-1">
        {marker && <span className={dashClass}>{marker}</span>}
        <span onClick={() => setOpen(!open)} className="flex cursor-pointer items-center gap-1">
          {open ? <ChevronDown size={13} className="text-slate-400" /> : <ChevronRight size={13} className="text-slate-400" />}
          {label !== undefined && <span className={keyClass}>{label}</span>}
          {label !== undefined && <span className={punctClass}>:</span>}
          {!open && <span className="text-slate-400">{summary}</span>}
        </span>
      </div>
      {open && (
        <Indent>
          {arr ? (
            <ArrayBody arr={value} path={path} depth={depth + 1} ctx={ctx} />
          ) : (
            <ObjectBody obj={value} path={path} depth={depth + 1} ctx={ctx} />
          )}
        </Indent>
      )}
    </div>
  )
}

function ObjectEntry({
  name,
  value,
  path,
  depth,
  ctx,
}: {
  name: string
  value: Json
  path: Path
  depth: number
  ctx: NodeCtx
}) {
  const childPath: Path = [...path, name]

  if (isMediaValue(name, value)) {
    return (
      <div className="py-0.5">
        <span className={keyClass}>{name}</span>
        <span className={punctClass}>:</span>
        <div className="mt-1">
          <MediaField keyName={name} value={value} />
        </div>
      </div>
    )
  }

  if (isLongText(value)) {
    return (
      <div className="py-0.5">
        <span className={keyClass}>{name}</span>
        <span className={punctClass}>:</span>
        {clickWrap(
          ctx,
          childPath,
          value,
          <pre className="mt-1 max-w-full overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-700">
            {value as string}
          </pre>,
        )}
      </div>
    )
  }

  if (isPrimitive(value)) {
    return (
      <div className="py-0.5">
        <span className={keyClass}>{name}</span>
        <span className={punctClass}>: </span>
        {clickWrap(ctx, childPath, value, <span className={typeColor(value)}>{display(value)}</span>)}
      </div>
    )
  }

  const inline = inlineOf(value, name)
  const avail = ctx.maxWidth - depth * 2 - (name.length + 2)
  if (inline !== null && inline.length <= avail) {
    return (
      <div className="py-0.5">
        <span className={keyClass}>{name}</span>
        <span className={punctClass}>: </span>
        {clickWrap(ctx, childPath, value, <span className={punctClass}>{inline}</span>)}
      </div>
    )
  }

  return (
    <div className="py-0.5">
      <Branch value={value as Json[] | {[k: string]: Json}} path={childPath} depth={depth} ctx={ctx} label={name} />
    </div>
  )
}

function ArrayItem({value, path, depth, ctx}: {value: Json; path: Path; depth: number; ctx: NodeCtx}) {
  if (isLongText(value)) {
    return (
      <div className="flex gap-1 py-0.5">
        <span className={dashClass}>-</span>
        {clickWrap(
          ctx,
          path,
          value,
          <pre className="mt-0.5 max-w-full overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-700">
            {value as string}
          </pre>,
        )}
      </div>
    )
  }
  if (isPrimitive(value)) {
    return (
      <div className="flex gap-1 py-0.5">
        <span className={dashClass}>-</span>
        {clickWrap(ctx, path, value, <span className={typeColor(value)}>{display(value)}</span>)}
      </div>
    )
  }
  const inline = inlineOf(value, undefined)
  const avail = ctx.maxWidth - depth * 2 - 2
  if (inline !== null && inline.length <= avail) {
    return (
      <div className="flex gap-1 py-0.5">
        <span className={dashClass}>-</span>
        {clickWrap(ctx, path, value, <span className={punctClass}>{inline}</span>)}
      </div>
    )
  }
  return (
    <div className="py-0.5">
      <Branch value={value as Json[] | {[k: string]: Json}} path={path} depth={depth} ctx={ctx} marker="-" />
    </div>
  )
}

function ArrayBody({arr, path, depth, ctx}: {arr: Json[]; path: Path; depth: number; ctx: NodeCtx}) {
  if (arr.length === 0) return <span className={punctClass}>[]</span>
  if (arr.every(isPrimitive)) {
    return (
      <div className="flex flex-wrap gap-1.5 py-0.5">
        {arr.map((v, i) => (
          <PrimChip key={i} value={v} path={[...path, i]} ctx={ctx} />
        ))}
      </div>
    )
  }
  return (
    <>
      {arr.map((v, i) => (
        <ArrayItem key={i} value={v} path={[...path, i]} depth={depth} ctx={ctx} />
      ))}
    </>
  )
}

function ObjectBody({obj, path, depth, ctx}: {obj: {[k: string]: Json}; path: Path; depth: number; ctx: NodeCtx}) {
  const entries = Object.entries(obj)
  if (entries.length === 0) return <span className={punctClass}>{"{}"}</span>
  return (
    <>
      {entries.map(([k, v]) => (
        <ObjectEntry key={k} name={k} value={v} path={path} depth={depth} ctx={ctx} />
      ))}
    </>
  )
}

export function PrettyDataViewer({data, maxWidth = 70, onValueClick}: ViewerProps) {
  const ctx: NodeCtx = {maxWidth, onValueClick}
  let body: ReactNode
  if (isArr(data)) body = <ArrayBody arr={data} path={[]} depth={0} ctx={ctx} />
  else if (isObj(data)) body = <ObjectBody obj={data} path={[]} depth={0} ctx={ctx} />
  else if (isLongText(data))
    body = (
      <pre className="max-w-full overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-700">
        {data as string}
      </pre>
    )
  else body = <span className={typeColor(data)}>{display(data)}</span>

  return (
    <div className="overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[13px] leading-relaxed text-slate-700">
      {body}
    </div>
  )
}

const demoData: Json = {
  id: 42,
  name: "Aurora Probe",
  active: true,
  tags: ["space", "probe", "aurora", "v2", "experimental", "long-range", "solar", "arctic"],
  scores: [10, 20, 30, 40, 55, 60],
  meta: {region: "north", tier: 3, calibrated: false},
  thumbnailUrl: "https://picsum.photos/seed/aurora/400/300",
  brokenImageUrl: "https://example.com/does-not-exist.png",
  homepageLink: "https://example.com",
  galleryUrls: [
    "https://picsum.photos/seed/a/200/200",
    "https://picsum.photos/seed/b/200/200",
    "https://picsum.photos/seed/c/200/200",
  ],
  description: "A short description that fits on one line.",
  log: "Line one\nLine two\nLine three\nStatus: nominal\nAll systems go across the board.",
  bigText: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(12),
  nested: {
    a: {b: {c: {d: "deep value", e: [1, 2, 3]}}},
    coords: {lat: 64.8, lng: -147.7},
    crew: [
      {name: "Ada", role: "pilot"},
      {name: "Ben", role: "engineer", certs: ["astro", "medic", "comms"]},
    ],
  },
}

export default function PrettyDataViewerDemo() {
  const [last, setLast] = useState<{k: Path; v: Json} | null>(null)
  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-3xl space-y-3">
        <div className="flex items-baseline justify-between">
          <h1 className="font-mono text-sm font-semibold text-slate-800">PrettyDataViewer</h1>
          <span className="font-mono text-xs text-slate-500">
            {last ? "clicked: " + last.k.join(".") : "click any value"}
          </span>
        </div>
        <PrettyDataViewer data={demoData} maxWidth={70} onValueClick={(k, v) => setLast({k, v})} />
        {last && (
          <div className="rounded-md border border-slate-200 bg-white p-2 font-mono text-xs text-slate-600">
            <span className="text-violet-700">[{last.k.map(String).join(", ")}]</span>{" = "}
            <span className="text-emerald-700">{JSON.stringify(last.v)?.slice(0, 120)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
