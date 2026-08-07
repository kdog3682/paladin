export type Param = {
  name: string
  type: string
  optional: boolean
  default?: string
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

export type ExportKind = "named" | "default"

export type BaseDoc = {
  name: string
  description: string
  exportKind?: ExportKind
}

export type FunctionDoc = BaseDoc & {
  kind: "function"
  params: Param[]
  returns: string
  async: boolean
}

export type MethodDoc = Omit<BaseDoc, "exportKind"> & {
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

export type ImportType = "builtin" | "relative" | "workspace" | "external"

export type ImportRef = {
  symbols: string[]
  source: string
  type: ImportType
}

export type FileDoc = {
  path: string
  imports: ImportRef[]
  symbols: SymbolDoc[]
}
