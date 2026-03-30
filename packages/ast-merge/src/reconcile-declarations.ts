// @paladin/ast-merge/src/reconcile-declarations.ts

import type { TopLevelNode, ConflictResolution } from './types'

/**
 * Reconciles two top-level declarations with the same identity.
 * Handles functions, classes, variables, enums, type aliases.
 */
export function reconcileDeclaration(
  existing: TopLevelNode,
  incoming: TopLevelNode,
  onConflict: ConflictResolution,
): TopLevelNode[] {
  switch (onConflict) {
    case 'incoming':
      return [incoming]
    case 'existing':
      return [existing]
    case 'both':
      return [existing, incoming]
  }
}
