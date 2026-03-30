// @paladin/ast-merge/src/types.ts

import type { namedTypes } from 'ast-types'

export type NodeKind =
  | 'import'
  | 'export-named'
  | 'export-default'
  | 'export-all'
  | 'function'
  | 'class'
  | 'variable'
  | 'type-alias'
  | 'interface'
  | 'enum'
  | 'expression'
  | 'unknown'

export type ConflictResolution = 'incoming' | 'existing' | 'both'

export interface MergeOptions {
  onConflict?: ConflictResolution
  mergeInterfaces?: boolean
  mergeImports?: boolean
  preserveOrder?: boolean
}

export const DEFAULT_OPTIONS: Required<MergeOptions> = {
  onConflict: 'incoming',
  mergeInterfaces: false,
  mergeImports: true,
  preserveOrder: true,
}

export interface NodeIdentity {
  kind: NodeKind
  name: string
}

export type TopLevelNode = namedTypes.Statement
