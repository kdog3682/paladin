import { existsSync, readFileSync } from "node:fs"
import { resolveScopedPath } from "@paladin/utils"
import { append, deprecate, merge, remove, skip, write } from "../ops"
import type { FsOp, PathResolutionOpts } from "../types"

// matches a leading '// path', '# path', '/* path */', or '<!-- path -->' comment line
const COMMENT_RE = /^\s*(?:\/\/|#|\/\*+|<!--)\s*(.+?)\s*(?:\*+\/|-->\s*)?$/;
// requires the path to end in a file extension, e.g. '.ts'
const EXT_RE = /\.[a-z0-9]+$/i
// trailing directive on the header, e.g. '// foo.ts (append)'
const MARKER_RE = /\(\s*(append|merge|delete|deprecated?)\s*\)\s*$/i

const SOURCE = "parseFileContent"

type Marker = "append" | "merge" | "delete" | "deprecate" | null

function readMarker(header: string, lines: string[]): Marker {
  const match = header.match(MARKER_RE)
  if (match) {
    const raw = match[1]!.toLowerCase()
    if (raw === "append") return "append"
    if (raw === "merge") return "merge"
    if (raw === "delete") return "delete"
    return "deprecate"
  }
  if (lines.slice(0, 3).join("\n").toLowerCase().includes("deprecated")) return "deprecate"
  return null
}

/** Marker plus disk state decide the op. A file that's already gone is just deprecated. */
function toOp(marker: Marker, path: string, current: string | null, body: string): FsOp {
  const exists = current !== null

  if (marker === "deprecate") return deprecate(SOURCE, path)
  if (marker === "delete") return exists ? remove(SOURCE, path) : deprecate(SOURCE, path)
  if (marker === "append") return exists ? append(SOURCE, path, body) : write(SOURCE, path, body)
  if (marker === "merge") return exists ? merge(SOURCE, path, body) : write(SOURCE, path, body)

  if (!exists) return write(SOURCE, path, body)
  if (current.trimEnd() === body.trimEnd()) return skip(SOURCE, path, "unchanged", current)
  return write(SOURCE, path, body)
}

/** A package.json carries its own address: the `name` field, resolved like `@scope/pkg/package.json`. */
function packageJsonPath(content: string, opts: PathResolutionOpts): string | null {
  let name: unknown
  try {
    name = JSON.parse(content)?.name
  } catch {
    return null
  }
  if (typeof name !== "string" || !name.startsWith("@")) return null
  return resolveScopedPath(`${name}/package.json`, opts)
}

/**
 * Reads the path header off the first line of a file's content (after an optional
 * shebang), resolves it against opts, and checks the disk to decide what should
 * happen to it. Returns null when there's no usable header (a package.json falls back to its name).
 */
export function parseFileContent(content: string, opts: PathResolutionOpts): FsOp | null {
  if (content.trim() === "") return null

  const lines = content.split("\n")

  // skip a shebang line if present, so the header comment is checked next
  const idx = lines[0]?.startsWith("#!") ? 1 : 0
  const line = lines[idx]
  if (line === undefined) return null

  const match = line.match(COMMENT_RE)
  if (!match) {
    // no header to go by, but a package.json can be placed from its name
    const path = packageJsonPath(content, opts)
    if (!path) return null
    const current = existsSync(path) ? readFileSync(path, "utf8") : null
    return toOp(null, path, current, content)
  }

  const header = match[1]!.trim()
  const rawPath = header.replace(MARKER_RE, "").trim()
  if (!rawPath || !EXT_RE.test(rawPath)) return null

  // body is everything except the header/shebang line, with leading blank lines trimmed
  const body = lines
    .filter((_, i) => i !== idx)
    .join("\n")
    .replace(/^\n+/, "")

  const path = resolveScopedPath(rawPath, opts)
  const current = existsSync(path) ? readFileSync(path, "utf8") : null

  return toOp(readMarker(header, lines), path, current, body)
}
