import { isBuiltin as isNodeBuiltin } from "node:module"
import { isPackageName } from "../string/isPackageName"

export type ImportBinding = {
  /* name exported by the source module, "default" for default imports, "*" for namespaces */
  imported: string
  /* local binding name */
  local: string
  /* true for `import type` or an inline `type` specifier */
  isType: boolean
}

export type ImportKind = "workspace" | "local" | "external"

export type CollectedImport = {
  /* where the module lives: relative path, monorepo package, or third party package */
  type: ImportKind
  /* what to resolve: the module specifier for relative paths, the package root for bare ones, ie "./grammar", "lodash" */
  source: string
  /* the specifier exactly as written, ie "lodash/fp" */
  specifier: string
  bindings: ImportBinding[]
  /* true when the whole statement is `import type` */
  isType: boolean
  /* true for `import "x"` with no bindings */
  sideEffect: boolean
  /* true for `export ... from "x"`, which depends on the module like an import does */
  reexport: boolean
}

export type CollectImportsOptions = {
  /* scopes belonging to this monorepo, ie ["@paladin"]. other scoped packages are external. omitted, every scoped package is workspace */
  workspaceScopes?: string[]
}

export type Specifier = {
  /* name before `as` */
  name: string
  /* name after `as`, same as name when there is no alias */
  alias: string
  /* inline `type` specifier */
  isType: boolean
}

/* blank comments and template literal bodies (offsets kept) so statement regexes only see code */
export function blankModuleNoise(text: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, " ")
  return text.replace(
    /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(`(?:\\[\s\S]|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (match, str: string | undefined, tpl: string | undefined) => {
      if (str) return str
      if (tpl) return "`" + blank(tpl.slice(1, -1)) + "`"
      return blank(match)
    },
  )
}

/* parse a specifier list body, ie `a, type b, c as d` */
export function parseSpecifiers(body: string): Specifier[] {
  const unquote = (s: string) => (/^["']/.test(s) ? s.slice(1, -1) : s)
  const out: Specifier[] = []
  for (const raw of body.split(",")) {
    const m = raw.trim().match(/^(type\s+)?([\w$]+|"[^"]*"|'[^']*')(?:\s+as\s+([\w$]+|"[^"]*"|'[^']*'))?$/)
    if (!m) continue
    const name = unquote(m[2])
    out.push({ name, alias: m[3] ? unquote(m[3]) : name, isType: !!m[1] })
  }
  return out
}

function parseClause(clause: string, isType: boolean): ImportBinding[] {
  const bindings: ImportBinding[] = []
  let rest = clause
  const braces = rest.match(/\{([^}]*)\}/)
  if (braces) {
    for (const s of parseSpecifiers(braces[1])) {
      bindings.push({ imported: s.name, local: s.alias, isType: isType || s.isType })
    }
    rest = rest.replace(braces[0], "")
  }
  const ns = rest.match(/\*\s*as\s+([\w$]+)/)
  if (ns) {
    bindings.push({ imported: "*", local: ns[1], isType })
    rest = rest.replace(ns[0], "")
  }
  const def = rest.replace(/,/g, " ").trim()
  if (/^[\w$]+$/.test(def)) bindings.unshift({ imported: "default", local: def, isType })
  return bindings
}

function packageRoot(spec: string): string {
  const segs = spec.split("/")
  return spec.startsWith("@") ? segs.slice(0, 2).join("/") : (segs[0] ?? spec)
}

function isBuiltin(spec: string): boolean {
  if (spec.startsWith("bun:")) return true
  const root = packageRoot(spec)
  return isNodeBuiltin(spec) || isNodeBuiltin(root) || root === "bun"
}

/* classify a specifier, or null when it is a builtin or not a package name */
function locate(specifier: string, scopes?: string[]): Pick<CollectedImport, "type" | "source"> | null {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return { type: "local", source: specifier }
  if (isBuiltin(specifier)) return null
  const root = packageRoot(specifier)
  if (!isPackageName(root)) return null
  const workspace = scopes ? scopes.some((scope) => root.startsWith(`${scope}/`)) : root.startsWith("@")
  return { type: workspace ? "workspace" : "external", source: root }
}

/*
 * sync, regex based collection of static imports and `export ... from` re-exports in source order.
 * dynamic import() is ignored. builtins are dropped, bare specifiers collapse to their package root in `source`.
 */
export function collectImports(text: string, opts: CollectImportsOptions = {}): CollectedImport[] {
  const src = blankModuleNoise(text)
  const found: [number, CollectedImport][] = []
  const add = (at: number, specifier: string, rest: Omit<CollectedImport, "type" | "source" | "specifier">) => {
    const where = locate(specifier, opts.workspaceScopes)
    if (where) found.push([at, { ...where, specifier, ...rest }])
  }

  for (const m of src.matchAll(/^[ \t]*import\s*(["'])([^"'\n]+)\1/gm)) {
    add(m.index!, m[2], { bindings: [], isType: false, sideEffect: true, reexport: false })
  }

  const re = /^[ \t]*import\s+(type\s+(?!from\b))?([^;"'`]*?)\s*from\s*(["'])([^"'\n]+)\3/gm
  for (const m of src.matchAll(re)) {
    const isType = !!m[1]
    add(m.index!, m[4], { bindings: parseClause(m[2], isType), isType, sideEffect: false, reexport: false })
  }

  // export [type] * [as ns] from "x" | export [type] { a } from "x"
  const reexports = /^[ \t]*export\s+(type\s+)?(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*(["'])([^"'\n]+)\2/gm
  for (const m of src.matchAll(reexports)) {
    add(m.index!, m[3], { bindings: [], isType: !!m[1], sideEffect: false, reexport: true })
  }

  return found.sort((a, b) => a[0] - b[0]).map(([, imp]) => imp)
}
