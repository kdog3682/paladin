// @paladin/ast-merge/src/reconcile-exports.ts

import type { namedTypes as n } from 'ast-types'
import { builders as b } from 'ast-types'

/**
 * Merges two named export declarations.
 * Handles: export { a, b }, export { x } from './mod', and inline export declarations.
 * For re-exports from the same source, specifiers are merged.
 * For export lists (no source), specifiers are merged.
 * For inline exports (export function foo), incoming wins.
 */
export function reconcileExports(
  existing: n.ExportNamedDeclaration,
  incoming: n.ExportNamedDeclaration,
): n.ExportNamedDeclaration {
  // inline export — incoming replaces entirely
  if (incoming.declaration) {
    return incoming
  }

  // both are specifier lists (with or without source)
  const existingSpecs = existing.specifiers ?? []
  const incomingSpecs = incoming.specifiers ?? []

  const seen = new Set<string>()
  const merged: n.ExportSpecifier[] = []

  // incoming first so it wins on dupes
  for (const spec of incomingSpecs) {
    const name = exportedName(spec as n.ExportSpecifier)
    if (!seen.has(name)) {
      seen.add(name)
      merged.push(spec as n.ExportSpecifier)
    }
  }

  for (const spec of existingSpecs) {
    const name = exportedName(spec as n.ExportSpecifier)
    if (!seen.has(name)) {
      seen.add(name)
      merged.push(spec as n.ExportSpecifier)
    }
  }

  return b.exportNamedDeclaration(null, merged, existing.source)
}

function exportedName(spec: n.ExportSpecifier): string {
  const exported = spec.exported
  if (exported.type === 'Identifier') return exported.name
  return String((exported as any).value)
}
