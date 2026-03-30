// @paladin/docgen/types.ts

export interface DocGenOptions {
  /** If true, document all exports from all source files, not just what the entrypoint re-exports */
  expandAll?: boolean
}

export interface DocGenResult {
  entrypoint: string
  absolutePath: string
  /** Module-level description derived from the entrypoint file's leading docstring */
  description: string | null
  exports: ExportedSymbol[]
  importStatement: string
}

export type ExportedSymbol =
  | FunctionDoc
  | ClassDoc
  | TypeDoc
  | ConstDoc

export interface FunctionDoc {
  kind: "function"
  name: string
  description: string | null
  signature: string
  isAsync: boolean
  isGenerator: boolean
  params: ParamDoc[]
  returnType: string | null
}

export interface ClassDoc {
  kind: "class"
  name: string
  description: string | null
  methods: MethodDoc[]
  properties: PropertyDoc[]
}

export interface MethodDoc {
  name: string
  description: string | null
  signature: string
  visibility: "public" | "protected" | "private"
  isAsync: boolean
  isStatic: boolean
  params: ParamDoc[]
  returnType: string | null
}

export interface PropertyDoc {
  name: string
  type: string | null
  visibility: "public" | "protected" | "private"
  isStatic: boolean
  isReadonly: boolean
}

export interface TypeDoc {
  kind: "type"
  name: string
  description: string | null
  expanded: string
}

export interface ConstDoc {
  kind: "const"
  name: string
  description: string | null
  type: string | null
}

export interface ParamDoc {
  name: string
  type: string | null
  optional: boolean
  defaultValue: string | null
}

export interface TypeRegistry {
  [name: string]: {
    node: any
    source: string
  }
}

/** Describes a re-export from the entrypoint barrel file */
export interface BarrelExport {
  /** The name as exported (could differ from local via `export { Foo as Bar }`) */
  exportedName: string
  /** The local/original name in the source file */
  localName: string
  /** The relative source path (e.g., './foo') — null if defined inline */
  source: string | null
}
