// @paladin/packages/codeform/documenter.types.ts

export type Param = {
  name: string
  type: string
  optional: boolean
  description?: string
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
  description: string
  exported: boolean
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
  resolved?: string
}

export type FileDoc = {
  path: string
  imports: ImportRef[]
  symbols: SymbolDoc[]
}

export type SymbolRef = {
  file: string
  kind: SymbolKind
}

export type DirectoryDoc = {
  root: string
  files: FileDoc[]
  index: Record<string, SymbolRef>
  generated: number
}
