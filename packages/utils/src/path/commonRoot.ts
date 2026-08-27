/**
 * Longest directory prefix shared by every path. Filenames are never part of
 * the result, so a lone `src/a/b.ts` yields `src/a`. Returns `""` when the
 * paths share nothing, or when absolute and relative paths are mixed.
 */
export function commonRoot(paths: Iterable<string>): string {
  const list = [...paths]
  if (list.length === 0) return ""

  const absolute = list.every(isAbsolute)
  if (!absolute && list.some(isAbsolute)) return ""

  const dirs = list.map(path => segments(path).slice(0, -1))

  let shared = dirs[0] ?? []
  for (const dir of dirs.slice(1)) {
    let i = 0
    while (i < shared.length && i < dir.length && shared[i] === dir[i]) i++
    if (i === 0) return absolute ? "/" : ""
    shared = shared.slice(0, i)
  }

  if (shared.length === 0) return absolute ? "/" : ""
  return (absolute ? "/" : "") + shared.join("/")
}

function isAbsolute(path: string): boolean {
  return path.startsWith("/")
}

function segments(path: string): string[] {
  return path.split("/").filter(part => part !== "" && part !== ".")
}
