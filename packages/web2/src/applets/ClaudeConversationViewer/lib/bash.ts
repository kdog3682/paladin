/* the agent's bash calls are mostly `cd dir && cmd`, cat/grep/find, and python heredocs. this pulls them apart for display */

export type BashStep =
  | { kind: "cmd"; text: string }
  | { kind: "script"; lang: string; head: string; body: string }
  | { kind: "read"; paths: string[]; tail?: string }
  | { kind: "grep"; pattern: string; paths: string[]; opts: string[]; tail?: string }
  | { kind: "find"; paths: string[]; names: string[]; tail?: string }
export type BashView = { cwd?: string; steps: BashStep[] }

const HOME = /^\/home\/[^/]+/

export const shortPath = (p: string) => p.replace(HOME, "~")

/* split on top level `&&`, `||`, `;` and newlines, leaving quoted text and `|` alone */
const splitTop = (src: string): string[] => {
  const out: string[] = []
  let cur = ""
  let quote = ""
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!
    if (quote) {
      cur += ch
      if (ch === "\\" && quote === '"') cur += src[++i] ?? ""
      else if (ch === quote) quote = ""
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      cur += ch
    } else if (ch === "\\") {
      cur += ch + (src[++i] ?? "")
    } else if (ch === ";" || ch === "\n" || (ch === "&" && src[i + 1] === "&") || (ch === "|" && src[i + 1] === "|")) {
      if (ch === "&" || ch === "|") i++
      out.push(cur)
      cur = ""
    } else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim()).filter(Boolean)
}

/* words with quotes removed. a lone `|` ends the command, the rest is kept as text */
const words = (src: string): { args: string[]; tail?: string } => {
  const args: string[] = []
  let cur = ""
  let has = false
  let quote = ""
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!
    if (quote) {
      if (ch === quote) quote = ""
      else if (ch === "\\" && quote === '"' && i + 1 < src.length) cur += src[++i]
      else cur += ch
    } else if (ch === "'" || ch === '"') {
      quote = ch
      has = true
    } else if (/\s/.test(ch)) {
      if (has) args.push(cur)
      cur = ""
      has = false
    } else if (ch === "|" && !cur) {
      if (has) args.push(cur)
      return { args, tail: src.slice(i).trim() }
    } else {
      cur += ch
      has = true
    }
  }
  if (has) args.push(cur)
  return { args }
}

const unquote = (s: string) => s.replace(/^(['"])(.*)\1$/, "$2")

const langOf = (head: string) => {
  const m = head.match(/^(?:\S*\/)?(python3?|node|bun|ruby|perl|bash|sh|fish)\b/)
  return m ? m[1]!.replace(/^python3$/, "python") : "sh"
}

/* `2>/dev/null`, `2>&1`, `>/dev/null`: never the point of the command */
const isNoise = (a: string) => /^\d*>&?(\d|\/dev\/null)?$/.test(a) || a === "/dev/null"

const dropNoise = (args: string[]) => {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (/^\d*>$/.test(a) && args[i + 1] === "/dev/null") i++
    else if (!isNoise(a)) out.push(a)
  }
  return out
}

const readStep = (args: string[], tail?: string): BashStep | undefined => {
  const paths = args.slice(1).filter((a) => !a.startsWith("-"))
  return paths.length && args.slice(1).every((a) => a === "-n" || !a.startsWith("-") || a === "--") ? { kind: "read", paths, tail } : undefined
}

// flags that only say "search the tree", which is what the Grep is already
const GREP_NOISE = /^-[rRnHIsE]+$|^--(recursive|line-number|with-filename|binary-files|color|colour)(=.*)?$|^--exclude(-dir)?(=.*)?$/
const GREP_WITH_VALUE = new Set(["--exclude", "--exclude-dir", "-e"])

const grepStep = (args: string[], tail?: string): BashStep | undefined => {
  const opts: string[] = []
  const rest: string[] = []
  for (let i = 1; i < args.length; i++) {
    const a = args[i]!
    if (GREP_WITH_VALUE.has(a) && a !== "-e") i++
    else if (GREP_NOISE.test(a)) continue
    else if (a.startsWith("-") && a.length > 1) opts.push(a.replace(/^--include=/, ""))
    else rest.push(a)
  }
  const [pattern, ...paths] = rest
  return pattern === undefined ? undefined : { kind: "grep", pattern, paths, opts, tail }
}

const findStep = (args: string[], tail?: string): BashStep | undefined => {
  const paths: string[] = []
  const names: string[] = []
  let i = 1
  for (; i < args.length && !args[i]!.startsWith("-") && args[i] !== "!"; i++) paths.push(args[i]!)
  for (; i < args.length; i++) {
    const a = args[i]!
    // exclusions (`-not -path '*/node_modules/*'`) are noise, so is -type
    if (a === "-not" || a === "!") i += 2
    else if (a === "-type") i++
    else if (a === "-name" || a === "-iname") names.push(args[++i] ?? "")
    else if (a === "-o" || a === "(" || a === ")" || a === "-print") continue
    else names.push(a)
  }
  return { kind: "find", paths: paths.length ? paths : ["."], names, tail }
}

const structured = (part: string): BashStep | undefined => {
  const { args: raw, tail } = words(part)
  const args = dropNoise(raw)
  switch (args[0]) {
    case "cat":
      return readStep(args, tail)
    case "grep":
    case "rg":
      return grepStep(args, tail)
    case "find":
      return findStep(args, tail)
  }
}

/* `for f in a b; do cat $f; done` is a read of a and b */
const FOR_CAT = /for\s+(\w+)\s+in\s+([^;\n]+?);\s*do\s+(?:[^;\n]*?;\s*)*?cat\s+["']?\$\{?\1\}?["']?[^;\n]*;?\s*done/g

const HEREDOC = /<<-?\s*(['"]?)(\w+)\1[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*(?=\n|$)/

export function formatBash(command: string): BashView {
  // heredocs first, since their bodies would be shredded by the splitter
  const scripts: BashStep[] = []
  const shell = command
    .replace(HEREDOC, (_all, _q, _tag, body: string) => {
      scripts.push({ kind: "script", lang: "sh", head: "", body })
      return `\u0000${scripts.length - 1}\u0000`
    })
    .replace(FOR_CAT, (_all, _v, items: string) => `cat ${items.trim()}`)

  let cwd: string | undefined
  const steps: BashStep[] = []
  let leading = true
  for (const part of splitTop(shell)) {
    const cd = leading && part.match(/^cd\s+(.+)$/)
    if (cd) {
      cwd = shortPath(unquote(cd[1]!))
      continue
    }
    leading = false
    const slot = part.match(/\u0000(\d+)\u0000/)
    if (slot) {
      const head = part.replace(/\s*\u0000\d+\u0000/, "").trim()
      const s = scripts[Number(slot[1])] as Extract<BashStep, { kind: "script" }>
      steps.push({ ...s, lang: langOf(head), head })
    } else steps.push(structured(part) ?? { kind: "cmd", text: part })
  }
  return { cwd, steps }
}
