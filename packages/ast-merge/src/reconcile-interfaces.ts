// @paladin/ast-merge/src/reconcile-interfaces.ts

import type { namedTypes as n } from 'ast-types'

/**
 * Merges two interface declarations with the same name.
 * Combines members — incoming wins on duplicate property names.
 * If mergeInterfaces is false, incoming replaces entirely.
 */
export function reconcileInterfaces(
  existing: n.TSInterfaceDeclaration,
  incoming: n.TSInterfaceDeclaration,
  merge: boolean,
): n.TSInterfaceDeclaration {
  if (!merge) return incoming

  const existingBody = existing.body.body
  const incomingBody = incoming.body.body

  const seen = new Set<string>()
  const merged: any[] = []

  // incoming first — wins on dupes
  for (const member of incomingBody) {
    const name = memberName(member)
    if (name) seen.add(name)
    merged.push(member)
  }

  for (const member of existingBody) {
    const name = memberName(member)
    if (name && seen.has(name)) continue
    merged.push(member)
  }

  // mutate a clone of incoming so we keep its extends/typeParameters
  const result = { ...incoming }
  result.body = { ...incoming.body, body: merged }
  return result as n.TSInterfaceDeclaration
}

function memberName(member: any): string | null {
  if (member.key?.type === 'Identifier') return member.key.name
  if (member.key?.type === 'StringLiteral') return member.key.value
  return null
}
