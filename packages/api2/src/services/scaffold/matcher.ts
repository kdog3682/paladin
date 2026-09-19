import { basename, extname } from "node:path"
import { classify } from "@paladin/utils"

/**
 * How a registration picks its files. Every field that is set must hold, and a
 * matcher with none set matches nothing.
 */
export interface Matcher {
  /** Compared against `kindOf(path)`. */
  kind?: string
  /** Extension without the dot, e.g. `tsx`. */
  ext?: string
  /** Exact file name, e.g. `App.tsx`. */
  basename?: string
}

/**
 * Path patterns matched directly, ahead of classify(). classify() only
 * knows the kinds in rules.json, so anything runnable that lives outside
 * that scheme (a suffix like `.examples.ts`, a directory like recast's
 * specs/) needs an entry here instead.
 */
const PATTERN_KINDS: { kind: string; pattern: RegExp }[] = [
  { kind: "example", pattern: /\.examples\.\w+$/ },
  { kind: "recast-spec", pattern: /(^|\/)packages\/recast\/src\/specs\// },
  // a transform, a command, or a file of the corpus they are tested against (classify() calls those "corpus")
  {
    kind: "codemod",
    pattern: /(^|\/)packages\/codemod\/(src\/(transforms|commands)\/[^/]+|corpus\/[^/]+\/(output))\.ts$/,
  },
]

/** The kind of `path`: a pattern kind first, then classify(). */
export function kindOf(path: string): string | null {
  for (const { kind, pattern } of PATTERN_KINDS) {
    if (pattern.test(path)) return kind
  }
  return classify(path)
}

/** Pass `kind` when it is already known, to skip working it out again. */
export function matches(matcher: Matcher, path: string, kind: string | null = kindOf(path)): boolean {
  if (matcher.kind === undefined && matcher.ext === undefined && matcher.basename === undefined) return false
  if (matcher.kind !== undefined && matcher.kind !== kind) return false
  if (matcher.ext && matcher.ext !== extname(path).slice(1)) return false
  if (matcher.basename && matcher.basename !== basename(path)) return false
  return true
}

/** Whether any of `matchers` claims `path`. */
export function matchesAny(matchers: readonly Matcher[], path: string): boolean {
  const kind = kindOf(path)
  return matchers.some((matcher) => matches(matcher, path, kind))
}
