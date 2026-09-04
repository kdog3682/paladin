export interface StackFrame {
  fn: string
  file: string
  line: number
  column: number
  native: boolean
  raw: string
}

export interface ParsedError {
  name: string
  message: string
  frames: StackFrame[]
  dropped: number
  text: string
}

export interface ParseErrorOptions {
  /* keep frames under this dir, stop at the first one outside it */
  root?: string
  /* stop at the first frame matching this */
  stop?: string | RegExp | ((frame: StackFrame) => boolean)
  /* hard cap on kept frames */
  depth?: number
  /* render file paths relative to root (default true when root is given) */
  relative?: boolean
}

const FRAME = /^\s*at\s+(?:(.+?)\s+\((.+)\)|(.+))$/
const LOC = /^(.*):(\d+):(\d+)$/

/* bun/node print frames on their own lines, but a stack that has been through
   JSON or a log line often arrives flattened, so split on both */
function lines(text: string): string[] {
  return text.split(/\r?\n|\s{2,}(?=at\s)/).filter(line => line.trim())
}

function toFrame(line: string): StackFrame | null {
  const match = FRAME.exec(line.trim())
  if (!match) return null
  const [, named, loc, bare] = match
  const target = (loc ?? bare ?? "").trim()
  const place = LOC.exec(target)
  const file = place ? place[1] : target
  return {
    fn: (named ?? "<anonymous>").replace(/^async\s+/, "").trim(),
    file,
    line: place ? Number(place[2]) : 0,
    column: place ? Number(place[3]) : 0,
    native: !file.startsWith("/") && !file.includes("://"),
    raw: line.trim(),
  }
}

function stopper(options: ParseErrorOptions): (frame: StackFrame) => boolean {
  const { root, stop } = options
  return frame => {
    if (typeof stop === "function" && stop(frame)) return true
    if (typeof stop === "string" && frame.file.includes(stop)) return true
    if (stop instanceof RegExp && stop.test(frame.file)) return true
    if (root && !frame.native && !frame.file.startsWith(root)) return true
    return false
  }
}

function render(name: string, message: string, frames: StackFrame[], root?: string, relative?: boolean): string {
  const head = message ? `${name}: ${message}` : name
  const rel = relative ?? Boolean(root)
  const body = frames.map(frame => {
    const file = rel && root && frame.file.startsWith(root) ? frame.file.slice(root.length).replace(/^\//, "") : frame.file
    const loc = frame.line ? `${file}:${frame.line}:${frame.column}` : file
    return `    at ${frame.fn} (${loc})`
  })
  return [head, ...body].join("\n")
}

/* split an error or stack string into its header and frames, dropping every
   frame from the first one outside `root` (or matching `stop`) onward */
export function parseError(input: unknown, options: ParseErrorOptions = {}): ParsedError {
  const raw = input instanceof Error ? (input.stack ?? `${input.name}: ${input.message}`) : String(input ?? "")
  const all = lines(raw)
  const header: string[] = []
  const parsed: StackFrame[] = []
  for (const line of all) {
    const frame = toFrame(line)
    if (frame && parsed.length === 0 && header.length === 0 && !/^\s*at\s/.test(line)) {
      header.push(line)
      continue
    }
    if (frame && /^\s*at\s/.test(line.trim() ? line : "")) parsed.push(frame)
    else if (parsed.length === 0) header.push(line)
  }

  const head = header.join("\n").trim()
  const colon = head.indexOf(":")
  const name = colon === -1 ? head || "Error" : head.slice(0, colon).trim()
  const message = colon === -1 ? "" : head.slice(colon + 1).trim()

  const shouldStop = stopper(options)
  const kept: StackFrame[] = []
  for (const frame of parsed) {
    if (shouldStop(frame)) break
    kept.push(frame)
    if (options.depth && kept.length >= options.depth) break
  }

  return {
    name,
    message,
    frames: kept,
    dropped: parsed.length - kept.length,
    text: render(name, message, kept, options.root, options.relative),
  }
}
