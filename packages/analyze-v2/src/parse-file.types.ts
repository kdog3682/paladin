// @paladin/packages/analyze-v2/parse-file.types.ts

export type Param = {
  name: string
  type: string
  optional: boolean
  docstr?: string
}

export type SymbolKind =
  | "function"
  | "class"
  | "method"
  | "interface"
  | "type"
  | "enum"
  | "const"
  | "variable"

export type BaseDoc = {
  name: string
  docstr: string
  exported: boolean
  /** 0-indexed line range in original source [start, end) */
  lineRange: [number, number]
}

export type FunctionDoc = BaseDoc & {
  kind: "function"
  params: Param[]
  returns: string
  async: boolean
}

export type MethodDoc = Omit<BaseDoc, "exported"> & {
  kind: "method"
  params: Param[]
  returns: string
  async: boolean
  static: boolean
  getter: boolean
  setter: boolean
  visibility: "public" | "private" | "protected"
}

export type ClassDoc = BaseDoc & {
  kind: "class"
  properties: Param[]
  methods: MethodDoc[]
}

export type TypeDoc = BaseDoc & {
  kind: "type" | "interface" | "enum"
  properties: Param[]
  /** Raw source for type aliases (e.g. `type Status = "idle" | "loading"`) */
  signature?: string
}

export type ConstDoc = BaseDoc & {
  kind: "const" | "variable"
  type: string
  value?: string
}

export type SymbolDoc = FunctionDoc | ClassDoc | TypeDoc | ConstDoc

export type ImportRef = {
  symbols: string[]
  source: string
  /** Resolved absolute path within the project, set during graph building */
  resolved?: string
}

export type FileDoc = {
  docstr?: string
  /** Leading path comment like `@foo/bar.ts` */
  pathComment?: string
  /** Shebang line like `#!/usr/bin/env node` */
  shebang?: string
  imports: ImportRef[]
  symbols: SymbolDoc[]
  /** Top-level statements: expressions, calls, IIFE, if-blocks, etc. */
  statements: StatementBlock[]
  /** Leading file path comment like `// @foo/bar.ts` if present */
  pathComment?: string
  /** Shebang line like `#!/usr/bin/env node` if present */
  shebang?: string
}

export type StatementBlock = {
  /** Raw source text */
  source: string
  lineRange: [number, number]
}
