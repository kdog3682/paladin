import { blankModuleNoise, parseSpecifiers } from "./collectImports.ts"

export type ExportKind = "named" | "reexport" | "star" | "declaration" | "default"

export type CollectedExport = {
  /* exported name, "*" for `export * from`, "default" for default exports */
  name: string
  /* name before `as`, or the declared name */
  local: string
  /* source module for re-exports */
  source?: string
  kind: ExportKind
  /* declaration keyword for kind "declaration" ie const | function | class */
  declaration?: string
  /* type-only export (type, interface, `export type {}`, inline `type` specifier) */
  isType: boolean
}

const TYPE_DECLS = new Set(["type", "interface"])

/* sync, regex based collection of exports in source order */
export function collectExports(text: string): CollectedExport[] {
  const src = blankModuleNoise(text)
  const found: [number, CollectedExport][] = []
  const add = (at: number, exp: CollectedExport) => found.push([at, exp])

  // export [type] { a, b as c } [from "x"]
  for (const m of src.matchAll(/^[ \t]*export\s+(type\s+)?\{([^}]*)\}(?:\s*from\s*(["'])([^"'\n]+)\3)?/gm)) {
    const source = m[4]
    for (const s of parseSpecifiers(m[2])) {
      add(m.index!, {
        name: s.alias,
        local: s.name,
        source,
        kind: source ? "reexport" : "named",
        isType: !!m[1] || s.isType,
      })
    }
  }

  // export [type] * [as ns] from "x"
  for (const m of src.matchAll(/^[ \t]*export\s+(type\s+)?\*(?:\s*as\s+([\w$]+))?\s*from\s*(["'])([^"'\n]+)\3/gm)) {
    add(m.index!, { name: m[2] ?? "*", local: "*", source: m[4], kind: "star", isType: !!m[1] })
  }

  // export default ...
  const defaultRe =
    /^[ \t]*export\s+default\s+(?:(?:async\s+)?function\s*\*?\s*([\w$]+)?|(?:abstract\s+)?class\s+([\w$]+)?|(interface)\s+([\w$]+))?/gm
  for (const m of src.matchAll(defaultRe)) {
    add(m.index!, { name: "default", local: m[1] ?? m[2] ?? m[4] ?? "default", kind: "default", isType: !!m[3] })
  }

  // export [declare] [async] [abstract] <keyword> name
  const declRe =
    /^[ \t]*export\s+(?:declare\s+)?(?:async\s+)?(?:abstract\s+)?(const\s+enum|function|class|const|let|var|enum|type|interface|namespace|module)(?:\s*\*\s*|\s+)([\w$]+)/gm
  for (const m of src.matchAll(declRe)) {
    const declaration = m[1].replace(/\s+/g, " ")
    add(m.index!, { name: m[2], local: m[2], kind: "declaration", declaration, isType: TYPE_DECLS.has(declaration) })
  }

  // export const { a, b: c } = ... / export const [a, b] = ...
  for (const m of src.matchAll(/^[ \t]*export\s+(const|let|var)\s*([{[])([^}\]]*)[}\]]/gm)) {
    for (const part of m[3].split(",")) {
      const name = part.split("=")[0].split(":").pop()!.replace("...", "").trim()
      if (/^[\w$]+$/.test(name)) add(m.index!, { name, local: name, kind: "declaration", declaration: m[1], isType: false })
    }
  }

  return found.sort((a, b) => a[0] - b[0]).map(([, exp]) => exp)
}
