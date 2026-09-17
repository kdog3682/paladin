import { join, sep } from "node:path"

/** Directory names and file suffixes skipped unless includeIgnored is set. */
const DEFAULT_IGNORE = [
  ".git",
  ".cache",
  ".next",
  ".turbo",
  "node_modules",
  "build",
  "coverage",
  "dist",
  "out",
  "vendor",
  ".d.ts",
  ".d.tsx",
  ".min.js",
  ".map",
  ".snap",
]

export type ListFilesOptions = {
  /** Glob matched against paths relative to dir. Defaults to every file. */
  glob?: string
  /** Keep only paths containing one of these substrings, e.g. [".examples.", ".demo."]. */
  markers?: string[]
  /** Extra directory names or file suffixes to skip, on top of the defaults. */
  ignore?: string[]
  /** Keep the default ignores out of it and match everything the glob finds. Defaults to false. */
  includeIgnored?: boolean
  /** Include dotfiles and dot directories. Defaults to false. */
  dot?: boolean
  /** Return absolute paths. Defaults to true. */
  absolute?: boolean
}

/**
 * List files under dir, narrowed by a glob and by substring markers. Build output,
 * vendor and declaration files are skipped by default.
 */
export async function listFiles(dir: string, options: ListFilesOptions = {}): Promise<string[]> {
  const {
    glob = "**/*",
    markers,
    ignore = [],
    includeIgnored = false,
    dot = false,
    absolute = true,
  } = options
  const skip = includeIgnored ? ignore : [...DEFAULT_IGNORE, ...ignore]
  const scanner = new Bun.Glob(glob)
  const files: string[] = []
  for await (const entry of scanner.scan({ cwd: dir, absolute: false, onlyFiles: true, dot })) {
    const path = entry.split(sep).join("/")
    if (isIgnored(path, skip)) continue
    if (markers && !markers.some((marker) => path.includes(marker))) continue
    files.push(absolute ? join(dir, entry) : entry)
  }
  return files
}

/** Matches a token against whole path segments, or against the tail for suffixes. */
function isIgnored(path: string, skip: string[]): boolean {
  const segments = path.split("/")
  return skip.some((token) => segments.includes(token) || path.endsWith(token))
}
