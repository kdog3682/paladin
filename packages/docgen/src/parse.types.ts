export type ImportType = "builtin" | "workspace" | "external" | "relative"
export type ExportKind = "none" | "named" | "default"
export type Visibility = "public" | "private" | "protected"

export type Loc = {
  /** 1-based line of the first character. */
  line: number
  /** 1-based column of the first character. */
  column: number
  endLine: number
  endColumn: number
}

export type ImportBinding = {
  /** Local name in this file. */
  name: string
  /** Original name when the binding is aliased. */
  imported?: string
  kind: "default" | "named" | "namespace"
  typeOnly: boolean
}

export type ImportRef = {
  source: string
  type: ImportType
  /** True for `import type { ... }`. */
  typeOnly: boolean
  bindings: ImportBinding[]
  /** Local names of every binding, convenience mirror of `bindings`. */
  symbols: string[]
  loc: Loc
}

export type ReExportBinding = {
  /** Name in the source module. */
  name: string
  /** Name this module exposes it as. */
  exported: string
}

export type ReExport = {
  source: string
  type: ImportType
  typeOnly: boolean
  /** True for `export * from "..."`. */
  star: boolean
  /** Set for `export * as ns from "..."`. */
  namespace?: string
  bindings: ReExportBinding[]
  loc: Loc
}

export type Param = {
  name: string
  type: string
  /** Reflects a `?` token only. Omissible = `optional || default !== undefined`. */
  optional: boolean
  default?: string
  rest?: boolean
  readonly?: boolean
  static?: boolean
  abstract?: boolean
  visibility?: Visibility
  description?: string
}

export type BaseDoc = {
  name: string
  description: string
  exportKind: ExportKind
  /** Set when exported under a different name, e.g. `export { a as b }`. */
  exportedAs?: string
  typeParams: string[]
  /** Named types referenced in this symbol's signature, e.g. `Foobar` in `(abc: Foobar) => void`. */
  typeReferences: string[]
  signature: string
  loc: Loc
}

export type MethodDoc = {
  name: string
  kind: "method"
  description: string
  typeParams: string[]
  params: Param[]
  returns: string
  async: boolean
  static: boolean
  abstract: boolean
  optional: boolean
  getter: boolean
  setter: boolean
  visibility: Visibility
  signature: string
  loc: Loc
}

export type FunctionDoc = BaseDoc & {
  kind: "function"
  params: Param[]
  returns: string
  async: boolean
  generator: boolean
  /** Overload signatures preceding the implementation. */
  overloads: string[]
}

export type ClassDoc = BaseDoc & {
  kind: "class"
  abstract: boolean
  extends?: string
  implements: string[]
  properties: Param[]
  methods: MethodDoc[]
}

export type TypeDoc = BaseDoc & {
  kind: "type" | "interface" | "enum"
  extends: string[]
  properties: Param[]
  methods: MethodDoc[]
  /** Right-hand side for non-object type aliases (unions, conditionals, ...). */
  value?: string
}

export type ConstDoc = BaseDoc & {
  kind: "const" | "variable"
  type: string
  value?: string
}

export type SymbolDoc = FunctionDoc | ClassDoc | TypeDoc | ConstDoc

export type FileDoc = {
  path: string
  imports: ImportRef[]
  reExports: ReExport[]
  symbols: SymbolDoc[]
}
