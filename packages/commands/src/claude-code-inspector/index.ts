import { readdir, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { join, basename } from "node:path"

export type Usage = {
  /* uncached input tokens */
  input: number
  /* tokens written to the prompt cache */
  cacheCreate: number
  /* tokens read from the prompt cache */
  cacheRead: number
  /* output tokens */
  output: number
}

export type ToolCall = {
  /* tool_use id */
  id: string
  /* tool name, ie Bash | Read | Edit | WebSearch | mcp__server__tool */
  name: string
  /* client = run by claude code (tool_use), server = run by the api (server_tool_use, mcp_tool_use) */
  kind: "client" | "server"
  /* raw tool input */
  input: Record<string, unknown>
  /* iso timestamp of the assistant message that issued the call */
  timestamp?: string
  /* assistant message id this call belongs to */
  turnId: string
  /* true when issued by a subagent */
  sidechain: boolean
  /* stringified tool result, if one was recorded */
  result?: string
  /* true when the tool result was flagged as an error */
  isError?: boolean
}

export type Turn = {
  /* assistant message id (lines sharing an id are merged) */
  id: string
  model?: string
  timestamp?: string
  /* true when produced by a subagent */
  sidechain: boolean
  usage: Usage
  toolCallIds: string[]
}

export type SessionReport = {
  file: string
  sessionId: string
  cwd?: string
  startedAt?: string
  endedAt?: string
  models: string[]
  /* number of real user prompts (excludes tool results and meta entries) */
  userPrompts: number
  turns: Turn[]
  toolCalls: ToolCall[]
  toolCounts: Record<string, number>
  totals: Usage
}

export type SessionFile = {
  path: string
  project: string
  mtime: Date
  size: number
}

export type ListOpts = {
  /* project cwd to look in; defaults to process.cwd() */
  project?: string
  /* search every project instead of just one */
  all?: boolean
  /* override ~/.claude/projects */
  root?: string
}

export type FormatOpts = {
  /* print full tool inputs and results instead of one-line summaries */
  full?: boolean
  /* expand only these tools (ie ["Bash"]); ignored when full is set */
  expand?: string[]
}

export const projectsRoot = () => join(homedir(), ".claude", "projects")

/* claude code stores a project as its cwd with every non-alphanumeric char replaced by "-" */
export function encodeProjectPath(cwd: string) {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-")
}

async function sessionsIn(dir: string): Promise<SessionFile[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const files = await Promise.all(
    names
      .filter((n) => n.endsWith(".jsonl"))
      .map(async (n) => {
        const path = join(dir, n)
        const s = await stat(path)
        return { path, project: basename(dir), mtime: s.mtime, size: s.size }
      }),
  )
  return files
}

/* sessions sorted newest first. falls back to all projects if the current one has none */
export async function listSessions(opts: ListOpts = {}): Promise<SessionFile[]> {
  const root = opts.root ?? projectsRoot()
  let files: SessionFile[] = []

  if (!opts.all) {
    const dir = join(root, encodeProjectPath(opts.project ?? process.cwd()))
    files = await sessionsIn(dir)
  }

  if (opts.all || files.length === 0) {
    const dirs = await readdir(root).catch(() => [] as string[])
    const nested = await Promise.all(dirs.map((d) => sessionsIn(join(root, d))))
    files = nested.flat()
  }

  return files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
}

/* index is 1-based counting back from the latest: 1 = last, 2 = second to last */
export async function resolveSession(index = 1, opts: ListOpts = {}) {
  const files = await listSessions(opts)
  const file = files[index - 1]
  if (!file) throw new Error(`no session at -${index} (found ${files.length})`)
  return file
}

const emptyUsage = (): Usage => ({ input: 0, cacheCreate: 0, cacheRead: 0, output: 0 })

function toUsage(u: any): Usage {
  return {
    input: u?.input_tokens ?? 0,
    cacheCreate: u?.cache_creation_input_tokens ?? 0,
    cacheRead: u?.cache_read_input_tokens ?? 0,
    output: u?.output_tokens ?? 0,
  }
}

function addUsage(a: Usage, b: Usage): Usage {
  return {
    input: a.input + b.input,
    cacheCreate: a.cacheCreate + b.cacheCreate,
    cacheRead: a.cacheRead + b.cacheRead,
    output: a.output + b.output,
  }
}

export const totalInput = (u: Usage) => u.input + u.cacheCreate + u.cacheRead

export const cacheHitRate = (u: Usage) => {
  const t = totalInput(u)
  return t ? u.cacheRead / t : 0
}

const asBlocks = (content: unknown): any[] => (Array.isArray(content) ? content : [])

function resultText(content: unknown): string {
  if (typeof content === "string") return content
  if (content && !Array.isArray(content)) return JSON.stringify(content)
  return asBlocks(content)
    .map((b) => (b.type === "text" ? b.text : b.type === "web_search_result" ? `${b.title} ${b.url}` : `[${b.type}]`))
    .join("\n")
}

const isToolUse = (b: any) => b?.type === "tool_use" || b?.type === "server_tool_use" || b?.type === "mcp_tool_use"

const isToolResult = (b: any) =>
  typeof b?.tool_use_id === "string" && typeof b.type === "string" && b.type.endsWith("tool_result")

async function readEntries(file: string): Promise<any[]> {
  const text = await Bun.file(file).text().catch(() => "")
  return text
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })
}

/* newer claude code writes subagent transcripts to <session>/subagents/*.jsonl next to the session file */
export async function subagentFiles(file: string): Promise<string[]> {
  const dir = join(file.replace(/\.jsonl$/, ""), "subagents")
  const names = await readdir(dir).catch(() => [] as string[])
  return names.filter((n) => n.endsWith(".jsonl")).map((n) => join(dir, n))
}

export async function parseSession(file: string): Promise<SessionReport> {
  const main = await readEntries(file)
  const subs = (await Promise.all((await subagentFiles(file)).map(readEntries)))
    .flat()
    .map((e) => ({ ...e, isSidechain: true }))
  // stable sort keeps original order for entries without timestamps
  const entries = [...main, ...subs].sort((a, b) =>
    a.timestamp && b.timestamp ? Date.parse(a.timestamp) - Date.parse(b.timestamp) : 0,
  )

  const turns = new Map<string, Turn>()
  const calls = new Map<string, ToolCall>()
  const models = new Set<string>()
  let sessionId = basename(file, ".jsonl")
  let cwd: string | undefined
  let startedAt: string | undefined
  let endedAt: string | undefined
  let userPrompts = 0

  for (const e of entries) {
    if (e.sessionId) sessionId = e.sessionId
    if (e.cwd && !cwd) cwd = e.cwd
    if (e.timestamp) {
      startedAt ??= e.timestamp
      endedAt = e.timestamp
    }
    const msg = e.message
    if (!msg) continue
    const sidechain = !!e.isSidechain

    // results can show up in user messages (client tools) or in the same assistant message (server tools)
    for (const block of asBlocks(msg.content)) {
      if (!isToolResult(block)) continue
      const call = calls.get(block.tool_use_id)
      if (!call) continue
      call.result = resultText(block.content)
      call.isError = !!block.is_error || block.content?.type?.endsWith?.("error") === true
    }

    if (e.type === "assistant") {
      const id = msg.id ?? e.uuid
      let turn = turns.get(id)
      if (!turn) {
        turn = { id, model: msg.model, timestamp: e.timestamp, sidechain, usage: emptyUsage(), toolCallIds: [] }
        turns.set(id, turn)
      }
      if (msg.model && msg.model !== "<synthetic>") models.add(msg.model)
      // split lines repeat the usage of the same message, so keep the latest instead of summing
      if (msg.usage) turn.usage = toUsage(msg.usage)

      for (const block of asBlocks(msg.content)) {
        if (!isToolUse(block) || calls.has(block.id)) continue
        calls.set(block.id, {
          id: block.id,
          name: block.server_name ? `${block.server_name}:${block.name}` : block.name,
          kind: block.type === "tool_use" ? "client" : "server",
          input: block.input ?? {},
          timestamp: e.timestamp,
          turnId: id,
          sidechain,
        })
        turn.toolCallIds.push(block.id)
      }
    } else if (e.type === "user") {
      let isPrompt = typeof msg.content === "string"
      for (const block of asBlocks(msg.content)) {
        if (block.type === "text") isPrompt = true
      }
      if (isPrompt && !sidechain && !e.isMeta) userPrompts++
    }
  }

  const turnList = [...turns.values()]
  const toolCalls = [...calls.values()]
  const toolCounts: Record<string, number> = {}
  for (const c of toolCalls) toolCounts[c.name] = (toolCounts[c.name] ?? 0) + 1

  return {
    file,
    sessionId,
    cwd,
    startedAt,
    endedAt,
    models: [...models],
    userPrompts,
    turns: turnList,
    toolCalls,
    toolCounts,
    totals: turnList.reduce((acc, t) => addUsage(acc, t.usage), emptyUsage()),
  }
}

/* inspect the nth most recent session (1 = last) */
export async function inspect(index = 1, opts: ListOpts = {}) {
  const file = await resolveSession(index, opts)
  return parseSession(file.path)
}

// ---------- formatting ----------

const n = (x: number) => x.toLocaleString("en-US")
const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim()
const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + "…" : s)
const clock = (ts?: string) => (ts ? new Date(ts).toLocaleTimeString("en-GB", { hour12: false }) : "--:--:--")

/* one-line summary of any tool's input: known keys first, otherwise compact json */
export function describeInput(input: Record<string, unknown>) {
  const keys = ["command", "file_path", "notebook_path", "path", "pattern", "url", "query", "skill", "subject", "description", "prompt", "message"]
  for (const k of keys) {
    const v = input[k]
    if (typeof v === "string" && v) return k === "pattern" && typeof input.path === "string" ? `${v}  in ${input.path}` : v
  }
  return JSON.stringify(input)
}

function duration(a?: string, b?: string) {
  if (!a || !b) return ""
  const mins = Math.round((Date.parse(b) - Date.parse(a)) / 60000)
  return mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60}m` : `${mins}m`
}

function usageLine(u: Usage) {
  return `in ${n(u.input)} · cw ${n(u.cacheCreate)} · cr ${n(u.cacheRead)} · out ${n(u.output)}`
}

export function formatReport(r: SessionReport, opts: FormatOpts = {}) {
  const out: string[] = []
  const t = r.totals
  const calls = new Map(r.toolCalls.map((c) => [c.id, c]))

  out.push(`session  ${r.sessionId}`)
  out.push(`file     ${r.file}`)
  if (r.cwd) out.push(`cwd      ${r.cwd}`)
  out.push(`time     ${r.startedAt ?? "?"} → ${clock(r.endedAt)} (${duration(r.startedAt, r.endedAt)})`)
  if (r.models.length) out.push(`models   ${r.models.join(", ")}`)
  out.push("")
  out.push("tokens")
  const rows: [string, number][] = [
    ["input (uncached)", t.input],
    ["cache write", t.cacheCreate],
    ["cache read", t.cacheRead],
    ["total input", totalInput(t)],
    ["output", t.output],
  ]
  const w = Math.max(...rows.map(([, v]) => n(v).length))
  for (const [label, v] of rows) out.push(`  ${label.padEnd(18)}${n(v).padStart(w)}`)
  out.push(`  ${"cache hit".padEnd(18)}${pct(cacheHitRate(t)).padStart(w)}`)
  out.push("")
  out.push(`prompts ${r.userPrompts} · turns ${r.turns.length} · tool calls ${r.toolCalls.length}`)
  const counts = Object.entries(r.toolCounts).sort((a, b) => b[1] - a[1])
  if (counts.length) out.push("  " + counts.map(([k, v]) => `${k} ${v}`).join(" · "))
  out.push("")
  out.push("turns")

  r.turns.forEach((turn, i) => {
    const tag = turn.sidechain ? " [sub]" : ""
    out.push(`  ${String(i + 1).padStart(3)}  ${clock(turn.timestamp)}  ${usageLine(turn.usage)}${tag}`)
    for (const id of turn.toolCallIds) {
      const c = calls.get(id)!
      const mark = c.isError ? " ✗" : c.result === undefined ? " …" : ""
      if (opts.full || opts.expand?.includes(c.name)) {
        out.push(`         ↳ ${c.name}${mark}`)
        out.push(indent(expandedBody(c), 11))
      } else {
        out.push(`         ↳ ${c.name.padEnd(10)} ${clip(oneLine(describeInput(c.input)), 90)}${mark}`)
      }
    }
  })

  return out.join("\n")
}

/* full input + result. bash gets a shell-style view: description, $ command, then output */
function expandedBody(c: ToolCall) {
  const lines: string[] = []
  if (c.name === "Bash" && typeof c.input.command === "string") {
    if (typeof c.input.description === "string") lines.push(`# ${c.input.description}`)
    lines.push(`$ ${c.input.command}`)
  } else {
    lines.push(JSON.stringify(c.input, null, 2))
  }
  if (c.result !== undefined) lines.push(c.result ? `→ ${c.result}` : "→ (no output)")
  return lines.join("\n")
}

const indent = (s: string, k: number) =>
  s
    .split("\n")
    .map((l) => " ".repeat(k) + l)
    .join("\n")

export function formatSessionList(files: SessionFile[], limit = 20) {
  return files
    .slice(0, limit)
    .map((f, i) => {
      const kb = `${Math.round(f.size / 1024)}kb`.padStart(7)
      return `  -${String(i + 1).padEnd(3)} ${f.mtime.toISOString().slice(0, 16).replace("T", " ")}  ${kb}  ${f.project}/${basename(f.path)}`
    })
    .join("\n")
}

// ---------- cli ----------

export type CliOpts = ListOpts & {
  /* 1-based index from the latest session, set via -1 | -2 | -3 */
  index: number
  json: boolean
  full: boolean
  /* tools to expand, set via --bash or --expand Bash,Edit */
  expand: string[]
  /* list recent sessions instead of inspecting one */
  list: boolean
}

export function parseArgs(argv: string[]): CliOpts {
  const opts: CliOpts = { index: 1, json: false, full: false, expand: [], list: false, all: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (/^-\d+$/.test(a)) opts.index = Math.max(1, Number(a.slice(1)))
    else if (a === "--json") opts.json = true
    else if (a === "--full" || a === "-f") opts.full = true
    else if (a === "--bash" || a === "-b") opts.expand.push("Bash")
    else if (a === "--expand" || a === "-e") opts.expand.push(...(argv[++i] ?? "").split(",").filter(Boolean))
    else if (a === "--all" || a === "-a") opts.all = true
    else if (a === "--list" || a === "-l") opts.list = true
    else if (a === "--project" || a === "-p") opts.project = argv[++i]
  }
  return opts
}

export async function main(argv: string[]) {
  const opts = parseArgs(argv)
  if (opts.list) {
    console.log(formatSessionList(await listSessions(opts)))
    return
  }
  const report = await inspect(opts.index, opts)
  console.log(opts.json ? JSON.stringify(report, null, 2) : formatReport(report, opts))
}

if (import.meta.main) await main(process.argv.slice(2))
