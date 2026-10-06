import type { ReactNode } from "react"
import type { ToolResultBlock, ToolUseBlock } from "../lib/api"
import { formatBash, shortPath, type BashStep, type BashView } from "../lib/bash"
import { ImageResult } from "./ImageResult"
import { Disclosure, Truncated } from "./Truncated"

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v, null, 2))

const Code = ({ children, lang }: { children: string; lang?: string }) => (
  <div className="rounded bg-neutral-50 px-2 py-1.5 text-xs text-neutral-800">
    {lang && <div className="mb-0.5 text-[10px] uppercase tracking-wide text-neutral-400">{lang}</div>}
    <Truncated text={children} />
  </div>
)

const Tail = ({ tail }: { tail?: string }) => (tail ? <span className="text-neutral-400"> {tail}</span> : null)

const Paths = ({ paths }: { paths: string[] }) => <>{paths.map(shortPath).join(", ")}</>

/* a step on one line, for the title and for the list under it */
function stepLine(s: Exclude<BashStep, { kind: "script" }>): ReactNode {
  switch (s.kind) {
    case "read":
      return (
        <>
          <b className="font-medium">Read</b> <Paths paths={s.paths} />
          <Tail tail={s.tail} />
        </>
      )
    case "grep":
      return (
        <>
          <b className="font-medium">Grep</b> <span className="text-amber-700">{s.pattern}</span>
          {s.paths.length > 0 && <> in <Paths paths={s.paths} /></>}
          {s.opts.length > 0 && <span className="text-neutral-400"> {s.opts.join(" ")}</span>}
          <Tail tail={s.tail} />
        </>
      )
    case "find":
      return (
        <>
          <b className="font-medium">Find</b> <Paths paths={s.paths} />
          {s.names.length > 0 && <span className="text-amber-700"> {s.names.join(" ")}</span>}
          <Tail tail={s.tail} />
        </>
      )
    case "cmd":
      return (
        <>
          <span className="text-neutral-400">$</span> {s.text}
        </>
      )
  }
}

function BashBody({ view }: { view: BashView }) {
  return (
    <div className="space-y-1.5">
      {view.cwd && <div className="text-[11px] text-neutral-400">in {view.cwd}</div>}
      {view.steps.map((s, i) =>
        s.kind === "script" ? (
          <div key={i}>
            {s.head && <div className="text-xs text-neutral-800"><span className="text-neutral-400">$</span> {s.head}</div>}
            <Code lang={s.lang}>{s.body}</Code>
          </div>
        ) : s.kind === "cmd" ? (
          <div key={i} className="flex gap-2 text-xs text-neutral-800">
            <span className="text-neutral-400">$</span>
            <Truncated text={s.text} className="min-w-0 flex-1" />
          </div>
        ) : (
          <div key={i} className="break-words text-xs text-neutral-800">{stepLine(s)}</div>
        ),
      )}
    </div>
  )
}

/* one-line title and the body shown under it, per tool */
function describe(tool: ToolUseBlock): { title: ReactNode; body?: ReactNode } {
  const i = tool.input
  switch (tool.name) {
    case "Bash": {
      const view = formatBash(str(i.command))
      const [first] = view.steps
      const more = view.steps.length > 1 ? <span className="text-neutral-400"> +{view.steps.length - 1}</span> : null
      const title = !first ? null : first.kind === "script" ? <>$ {first.head || first.lang}</> : stepLine(first)
      // a lone read/grep/find says everything in its title
      const lone = view.steps.length === 1 && first && first.kind !== "script" && first.kind !== "cmd" && !view.cwd
      return {
        title: (
          <>
            {i.description ? <span className="text-neutral-500">{str(i.description)} </span> : null}
            <span className="text-neutral-800">{title}</span>
            {more}
          </>
        ),
        body: lone ? undefined : <BashBody view={view} />,
      }
    }
    case "Grep":
      return { title: <>{str(i.pattern)} <span className="text-neutral-400">in {shortPath(str(i.path || "."))}</span></> }
    case "Glob":
      return { title: <>{str(i.pattern)} <span className="text-neutral-400">in {shortPath(str(i.path || "."))}</span></> }
    case "Read":
      return { title: <>Read {shortPath(str(i.file_path))}</> }
    case "Write":
      return {
        title: <>Write {shortPath(str(i.file_path))}</>,
        body: <Code>{str(i.content)}</Code>,
      }
    case "Edit":
      return {
        title: <>Edit {shortPath(str(i.file_path))}</>,
        body: (
          <div className="space-y-1">
            <div className="text-red-700"><Code>{str(i.old_string)}</Code></div>
            <div className="text-green-700"><Code>{str(i.new_string)}</Code></div>
          </div>
        ),
      }
    default: {
      const summary = Object.values(i).find((v) => typeof v === "string") as string | undefined
      return { title: <>{summary ? summary.split("\n")[0]!.slice(0, 120) : ""}</>, body: <Code>{str(i)}</Code> }
    }
  }
}

// the shell wrapper reports its own failures like this, without a nonzero exit
const WRAPPER_ERROR = /^\[rtk:/
const CWD_RESET = /\n?Shell cwd was reset to .*$/

function Result({ result }: { result: ToolResultBlock }) {
  const text = result.content
    .flatMap((c) => (c.type === "text" ? [c.text] : []))
    .join("\n")
    .replace(CWD_RESET, "")
  const failed = result.isError || WRAPPER_ERROR.test(text.trimStart())
  const images = result.content.flatMap((c) => (c.type === "image" ? [c] : []))
  const first = text.split("\n").find((l) => l.trim()) ?? (images.length ? "image" : "(empty)")
  return (
    <Disclosure
      tone={failed ? "text-red-600" : "text-neutral-500"}
      label={<>{failed ? "error: " : "→ "}{first.slice(0, 140)}</>}
      hint={text.length > 0 ? `${text.split("\n").length} lines` : undefined}
    >
      <div className="space-y-2">
        {text && <Truncated text={text} className="text-xs text-neutral-700" />}
        {images.map((img) => (
          <ImageResult key={img.src} image={img} />
        ))}
      </div>
    </Disclosure>
  )
}

/** a tool_use with its result folded in. both stay closed until clicked */
export function ToolCall({ tool, result }: { tool: ToolUseBlock; result?: ToolResultBlock }) {
  const { title, body } = describe(tool)
  return (
    <div className="space-y-1 rounded border border-neutral-200 bg-white px-2 py-1.5 font-mono">
      <div className="flex items-baseline gap-2 text-xs">
        <span className="shrink-0 rounded bg-neutral-100 px-1.5 text-[10px] font-medium uppercase text-neutral-500">
          {tool.name}
        </span>
        <div className="min-w-0 flex-1">
          {body ? (
            <Disclosure label={title}>{body}</Disclosure>
          ) : (
            <span className="block truncate text-neutral-800">{title}</span>
          )}
        </div>
      </div>
      {result && <Result result={result} />}
    </div>
  )
}
