export type FormatOpts = {
  /** how wide a union, object or list may get on one line before it breaks */
  width: number
  /** keep comments found inside types. off drops them */
  comments: boolean
}

type Item =
  | { kind: "text", text: string }
  | { kind: "comment", text: string }
  | { kind: "sep", text: string }

type Part = {
  /** the comments that sat above this part in the source */
  comments: string[]
  text: string
}

const OPENERS = "([{<"
const CLOSERS = ")]}>"
/** a property starting after whitespace, for member lists the parser flattened without separators */
const PROPERTY_START = /^\s+(?:readonly\s+)?[A-Za-z_$][\w$]*\??:/
/** a method starting after whitespace, for the same reason */
const METHOD_START = /^\s+(?!(?:keyof|typeof|infer|extends|new)\b)[A-Za-z_$][\w$]*\??\(/

/**
 * pretty prints a type expression. unions with comments or past the width go one member per line,
 * with each comment above the member it describes. object literals get one member per line.
 * multi-line unions come back starting with a newline, so use annotate/assign to attach them.
 */
export function formatType(source: string, opts: FormatOpts, block = false): string {
  return format(source.trim(), opts, true, block)
}

/** `head: type`, letting a broken union hang below the head */
export function annotate(head: string, type: string): string {
  return type.startsWith("\n") ? `${head}:${type}` : `${head}: ${type}`
}

/** `head = value`, letting a broken union hang below the head */
export function assign(head: string, value: string): string {
  return value.startsWith("\n") ? `${head} =${value}` : `${head} = ${value}`
}

export function indent(text: string, pad: string): string {
  return text.split("\n").map((line) => (line ? `${pad}${line}` : line)).join("\n")
}

export function indentTail(text: string, pad: string): string {
  return text.split("\n").map((line, at) => (at === 0 || !line ? line : `${pad}${line}`)).join("\n")
}

/** whether any of `seps` appears outside brackets, strings and comments */
export function hasTopLevel(text: string, seps: string): boolean {
  return scan(text, seps).some((item) => item.kind === "sep")
}

export function commentEnd(source: string, at: number): number {
  const end = source.indexOf("*/", at + 2)
  return end === -1 ? source.length : end + 2
}

export function stringEnd(source: string, at: number): number {
  const quote = source[at]
  let cursor = at + 1
  while (cursor < source.length && source[cursor] !== quote) cursor += source[cursor] === "\\" ? 2 : 1
  return Math.min(cursor + 1, source.length)
}

export function isQuote(ch: string): boolean {
  return ch === "'" || ch === "\"" || ch === "`"
}

function format(text: string, opts: FormatOpts, root: boolean, block: boolean): string {
  const union = scan(text, "|")
  if (union.some((item) => item.kind === "sep")) return formatUnion(parts(union), opts)

  const group = parenthesized(text)
  if (group) {
    if (root && !group.suffix) return format(group.inner, opts, true, block)
    const inner = format(group.inner, opts, false, false)
    return inner.startsWith("\n") ? `(${inner}\n)${group.suffix}` : `(${inner})${group.suffix}`
  }

  const intersection = scan(text, "&")
  if (intersection.some((item) => item.kind === "sep")) {
    return parts(intersection)
      .filter((part) => part.text)
      .map((part) => format(part.text, opts, false, block))
      .join(" & ")
  }

  if (text.startsWith("{") && matchClose(text, 0) === text.length - 1) {
    return formatObject(text.slice(1, -1), opts, block)
  }
  return formatRaw(collapse(text), opts)
}

function formatUnion(members: Part[], opts: FormatOpts): string {
  const rendered = members.flatMap(spread).map((part) => ({
    comments: opts.comments ? part.comments : [],
    text: part.text ? format(part.text, opts, false, false) : "",
  }))
  const plain = rendered.every((part) => part.comments.length === 0 && !part.text.includes("\n"))
  const inline = rendered.map((part) => part.text).filter(Boolean).join(" | ")
  if (plain && inline.length <= opts.width) return inline

  const lines = rendered.flatMap((part) => [
    ...part.comments.map(docLine),
    ...(part.text ? [`| ${indentTail(part.text, "  ")}`] : []),
  ])
  return `\n${indent(lines.join("\n"), " ")}`
}

/** lifts `(a | b)` members up into the surrounding union */
function spread(part: Part): Part[] {
  const group = parenthesized(part.text)
  if (!group || group.suffix) return [part]
  const inner = scan(group.inner, "|")
  if (!inner.some((item) => item.kind === "sep")) return [part]
  const members = parts(inner).flatMap(spread)
  if (members.length > 0) members[0] = { ...members[0], comments: [...part.comments, ...members[0].comments] }
  return members
}

function formatObject(inner: string, opts: FormatOpts, block: boolean): string {
  const members = parts(scan(inner, ";,", true))
    .map((part) => ({
      comments: opts.comments ? part.comments : [],
      text: part.text ? formatMember(part.text, opts) : "",
    }))
    .filter((member) => member.text || member.comments.length > 0)
  if (members.length === 0) return "{}"

  const plain = members.every((member) => member.comments.length === 0 && member.text && !member.text.includes("\n"))
  const inline = `{ ${members.map((member) => member.text).join(", ")} }`
  if (!block && plain && inline.length <= opts.width) return inline

  const lines = members.flatMap((member) => [
    ...member.comments.map(docLine),
    ...(member.text ? [member.text] : []),
  ])
  return ["{", indent(lines.join("\n"), " "), "}"].join("\n")
}

function formatMember(text: string, opts: FormatOpts): string {
  const colon = topColon(text)
  if (colon === -1) return text
  return annotate(text.slice(0, colon).trim(), format(text.slice(colon + 1).trim(), opts, true, false))
}

/** leaves the text alone apart from object literals nested in it, eg Array<{ ... }> */
function formatRaw(text: string, opts: FormatOpts): string {
  let out = ""
  let at = 0
  while (at < text.length) {
    const ch = text[at]
    if (ch === "/" && text[at + 1] === "*") {
      const stop = commentEnd(text, at)
      out += text.slice(at, stop)
      at = stop
      continue
    }
    if (isQuote(ch)) {
      const stop = stringEnd(text, at)
      out += text.slice(at, stop)
      at = stop
      continue
    }
    if (ch === "{") {
      const close = matchClose(text, at)
      if (close !== -1) {
        out += formatObject(text.slice(at + 1, close), opts, false)
        at = close + 1
        continue
      }
    }
    out += ch
    at++
  }
  return out
}

/** walks `source` at bracket depth 0, splitting on `seps` and lifting comments out as their own items */
function scan(source: string, seps: string, members = false): Item[] {
  const items: Item[] = []
  let buffer = ""
  let depth = 0
  let colon = false
  const flush = () => {
    const text = collapse(buffer)
    if (text) items.push({ kind: "text", text })
    buffer = ""
    colon = false
  }

  let at = 0
  while (at < source.length) {
    const ch = source[at]
    if (ch === "/" && source[at + 1] === "*") {
      const stop = commentEnd(source, at)
      if (depth === 0) {
        flush()
        items.push({ kind: "comment", text: commentText(source.slice(at, stop)) })
      } else buffer += source.slice(at, stop)
      at = stop
      continue
    }
    if (isQuote(ch)) {
      const stop = stringEnd(source, at)
      buffer += source.slice(at, stop)
      at = stop
      continue
    }
    if (depth === 0) {
      if (seps.includes(ch)) {
        flush()
        items.push({ kind: "sep", text: ch })
        at++
        continue
      }
      if (members && colon && /\s/.test(ch)) {
        const rest = source.slice(at)
        if (PROPERTY_START.test(rest) || METHOD_START.test(rest)) flush()
      }
      if (ch === ":") colon = true
    }
    if (OPENERS.includes(ch)) depth++
    else if (isCloser(source, at)) depth = Math.max(0, depth - 1)
    buffer += ch
    at++
  }
  flush()
  return items
}

/** groups scanned items into parts. a comment belongs to the part after it */
function parts(items: Item[]): Part[] {
  const out: Part[] = []
  let pending: string[] = []
  for (const item of items) {
    if (item.kind === "comment") pending.push(item.text)
    else if (item.kind === "text") {
      out.push({ comments: pending, text: item.text })
      pending = []
    }
  }
  if (pending.length > 0) out.push({ comments: pending, text: "" })
  return out
}

/** `(inner)` or `(inner)[]`, but not `(x) => y` */
function parenthesized(text: string): { inner: string, suffix: string } | undefined {
  if (!text.startsWith("(")) return undefined
  const close = matchClose(text, 0)
  if (close === -1) return undefined
  const suffix = text.slice(close + 1).trim()
  if (!/^(\[\])*$/.test(suffix)) return undefined
  return { inner: text.slice(1, close).trim(), suffix }
}

function matchClose(source: string, at: number): number {
  let depth = 0
  let cursor = at
  while (cursor < source.length) {
    const ch = source[cursor]
    if (ch === "/" && source[cursor + 1] === "*") {
      cursor = commentEnd(source, cursor)
      continue
    }
    if (isQuote(ch)) {
      cursor = stringEnd(source, cursor)
      continue
    }
    if (OPENERS.includes(ch)) depth++
    else if (isCloser(source, cursor)) {
      depth--
      if (depth === 0) return cursor
    }
    cursor++
  }
  return -1
}

function topColon(text: string): number {
  let depth = 0
  let at = 0
  while (at < text.length) {
    const ch = text[at]
    if (ch === "/" && text[at + 1] === "*") {
      at = commentEnd(text, at)
      continue
    }
    if (isQuote(ch)) {
      at = stringEnd(text, at)
      continue
    }
    if (OPENERS.includes(ch)) depth++
    else if (isCloser(text, at)) depth--
    else if (ch === ":" && depth === 0) return at
    at++
  }
  return -1
}

/** a closing bracket, not counting the > of => */
function isCloser(source: string, at: number): boolean {
  const ch = source[at]
  return CLOSERS.includes(ch) && !(ch === ">" && source[at - 1] === "=")
}

function commentText(comment: string): string {
  return collapse(
    comment
      .replace(/^\/\*+/, "")
      .replace(/\*+\/$/, "")
      .split("\n")
      .map((line) => line.replace(/^\s*\*\s?/, ""))
      .join(" "),
  )
}

function docLine(text: string): string {
  return `/** ${text} */`
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}
