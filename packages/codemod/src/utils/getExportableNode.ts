import { Node } from "ts-morph"

/* Resolves a declaration to the node that can actually carry an `export`
   modifier. Variable declarations resolve to their parent variable statement,
   since the modifier lives on the statement rather than the declaration.
   Everything else that supports the modifier (functions, classes, interfaces,
   type aliases, enums, namespaces) resolves to itself. Returns undefined when
   the node cannot carry an export modifier at all, e.g. an import specifier. */
export function getExportableNode(node: Node) {
  const target = Node.isVariableDeclaration(node)
    ? node.getVariableStatement()
    : node

  if (!target) return undefined
  if (!Node.isExportable(target)) return undefined

  return target
}
