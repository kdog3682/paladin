import { Glob } from "bun"

/** Globs matched against the full path; any one matching is enough. An empty list matches nothing. */
export type Matcher = readonly string[]

const compiled = new Map<string, Glob>()

function globOf(pattern: string): Glob {
  let glob = compiled.get(pattern)
  if (!glob) {
    glob = new Glob(pattern)
    compiled.set(pattern, glob)
  }
  return glob
}

export function matches(matcher: Matcher, path: string): boolean {
  return matcher.some((pattern) => globOf(pattern).match(path))
}

/** Whether any of `matchers` claims `path`. */
export function matchesAny(matchers: readonly Matcher[], path: string): boolean {
  return matchers.some((matcher) => matches(matcher, path))
}
