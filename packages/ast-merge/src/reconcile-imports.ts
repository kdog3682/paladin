// @paladin/ast-merge/src/reconcile-imports.ts

import type { namedTypes as n } from 'ast-types'
import { builders as b } from 'ast-types'

/**
 * Merges two import declarations from the same module source.
 * Combines named specifiers, dedupes, handles default + namespace imports.
 * Incoming specifiers win on conflict (e.g. both have a default import).
 */
export function reconcileImports(
  existing: n.ImportDeclaration,
  incoming: n.ImportDeclaration,
): n.ImportDeclaration {
  const existingSpecs = existing.specifiers ?? []
  const incomingSpecs = incoming.specifiers ?? []

  // side-effect import — nothing to merge
  if (existingSpecs.length === 0 && incomingSpecs.length === 0) {
    return existing
  }

  const merged: n.ImportSpecifier[] = []
  let defaultSpec: n.ImportDefaultSpecifier | null = null
  let namespaceSpec: n.ImportNamespaceSpecifier | null = null

  // collect from existing first
  for (const spec of existingSpecs) {
    if (spec.type === 'ImportDefaultSpecifier') defaultSpec = spec
    else if (spec.type === 'ImportNamespaceSpecifier') namespaceSpec = spec
    else merged.push(spec as n.ImportSpecifier)
  }

  // incoming overrides default/namespace, merges named
  for (const spec of incomingSpecs) {
    if (spec.type === 'ImportDefaultSpecifier') {
      defaultSpec = spec
    } else if (spec.type === 'ImportNamespaceSpecifier') {
      namespaceSpec = spec
    } else {
      const named = spec as n.ImportSpecifier
      const importedName = named.imported.type === 'Identifier'
        ? named.imported.name
        : named.imported.value
      const alreadyExists = merged.some(m =>
        m.imported.type === 'Identifier'
          ? m.imported.name === importedName
          : m.imported.value === importedName
      )
      if (!alreadyExists) {
        merged.push(named)
      }
    }
  }

  const allSpecs: (n.ImportDefaultSpecifier | n.ImportNamespaceSpecifier | n.ImportSpecifier)[] = []
  if (defaultSpec) allSpecs.push(defaultSpec)
  if (namespaceSpec) allSpecs.push(namespaceSpec)
  allSpecs.push(...merged)

  // preserve import type if incoming is a type import
  const importKind = incoming.importKind ?? existing.importKind ?? 'value'

  const result = b.importDeclaration(allSpecs, existing.source)
  ;(result as any).importKind = importKind
  return result
}
